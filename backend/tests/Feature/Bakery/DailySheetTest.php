<?php

namespace Tests\Feature\Bakery;

use App\Models\Category;
use App\Models\SheetShift;
use App\Models\UnsoldReport;
use App\Models\User;
use App\Services\DailySheetService;
use App\Services\ProductionService;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Concerns\BakeryFixtures;
use Tests\TestCase;

/**
 * Fiche journalière : équipes matin / soir / nuit contrôlées par la caisse.
 * Les tests s'exécutent dans la même seconde : ils couvrent aussi le cas où une
 * équipe s'ouvre au moment exact où la précédente se clôture.
 */
class DailySheetTest extends TestCase
{
    use RefreshDatabase, BakeryFixtures;

    private DailySheetService $sheets;
    private User $cashier;
    private User $baker;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBakery();
        $this->sheets = app(DailySheetService::class);

        foreach (['manage_daily_sheets', 'fill_daily_sheets'] as $p) {
            Permission::firstOrCreate(['name' => $p, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'gerant', 'guard_name' => 'web'])->syncPermissions(['manage_daily_sheets', 'fill_daily_sheets']);
        Role::firstOrCreate(['name' => 'caissier', 'guard_name' => 'web'])->syncPermissions(['fill_daily_sheets']);
        $this->user->assignRole('gerant');

        $this->cashier = $this->staff('caissier@fournil.test');
        $this->baker   = $this->staff('boulanger@fournil.test');

        // Baguette = pain : son reste de nuit part en invendus
        $breads = Category::create(['organization_id' => $this->store->organization_id, 'name' => 'Pains', 'slug' => 'pains-test', 'type' => 'common', 'unsold_end_of_day' => true]);
        $this->baguette->update(['category_id' => $breads->id]);

        // 100 baguettes en attente de répartition
        app(ProductionService::class)->produce($this->baguette, $this->store->id, $this->user->id, 1);
    }

    private function staff(string $email): User
    {
        $u = User::forceCreate(['name' => $email, 'email' => $email, 'password' => bcrypt('x'), 'store_id' => $this->store->id, 'organization_id' => $this->store->organization_id, 'is_active' => true]);
        $u->assignRole('caissier');

        return $u;
    }

    private function open(string $shift, User $responsible, ?User $by = null): SheetShift
    {
        return $this->sheets->open($this->store->id, today(), $shift, $responsible->id, $by ?? $this->user);
    }

    private function line(SheetShift $shift): array
    {
        return $this->sheets->lines($shift->fresh())->firstWhere('product_id', $this->baguette->id);
    }

    private function sell(int $qty): void
    {
        app(SaleService::class)->createSale(
            ['store_id' => $this->store->id, 'user_id' => $this->cashier->id, 'status' => 'draft', 'channel' => 'pos'],
            [['product_id' => $this->baguette->id, 'qty' => $qty]],
            [['payment_method' => 'cash', 'amount' => $qty * 175]],
        );
    }

    private function assertRefused(callable $fn, string $why): void
    {
        try {
            $fn();
            $this->fail("Aurait dû être refusé : {$why}");
        } catch (ValidationException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_added_quantity_can_never_exceed_production(): void
    {
        $matin = $this->open('matin', $this->cashier);

        $this->assertRefused(fn () => $this->sheets->add($matin, $this->baguette->id, 120, $this->cashier), '120 pour 100 produites');
        $this->sheets->add($matin, $this->baguette->id, 80, $this->cashier);
        $this->assertRefused(fn () => $this->sheets->add($matin, $this->baguette->id, 30, $this->cashier), 'cumul 110 pour 100');

        $this->assertEquals(80, $this->stockOf($this->baguette));
        $this->assertEquals(80, $this->line($matin)['added']);
    }

    public function test_correcting_an_addition_puts_it_back_in_production(): void
    {
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->add($matin, $this->baguette->id, 80, $this->cashier);

        $this->sheets->remove($matin, $this->baguette->id, 30, $this->cashier);
        $this->assertRefused(fn () => $this->sheets->remove($matin, $this->baguette->id, 60, $this->cashier), 'plus que l\'ajouté de l\'équipe');

        $this->assertEquals(50, $this->line($matin)['added']);
        $this->assertEquals(50, $this->stockOf($this->baguette));
        // Les 50 retirées redeviennent disponibles
        $this->sheets->add($matin, $this->baguette->id, 50, $this->cashier);
    }

    public function test_only_the_responsible_or_the_manager_can_fill_a_shift(): void
    {
        $this->assertRefused(fn () => $this->open('matin', $this->baker, $this->cashier), 'ouvrir au nom d\'un autre');

        $matin = $this->open('matin', $this->cashier);
        $this->assertRefused(fn () => $this->sheets->add($matin, $this->baguette->id, 1, $this->baker), 'non responsable');
        $this->sheets->add($matin, $this->baguette->id, 1, $this->user); // le gérant peut
        $this->addToAssertionCount(1);
    }

    public function test_shifts_follow_the_order_and_only_one_is_open(): void
    {
        $this->assertRefused(fn () => $this->open('soir', $this->cashier), 'soir avant matin');
        $this->open('matin', $this->cashier);
        $this->assertRefused(fn () => $this->open('soir', $this->baker), 'matin encore ouvert');
        $this->assertRefused(fn () => $this->open('matin', $this->baker), 'matin déjà ouvert');
    }

    public function test_closing_flags_the_gap_and_resets_pos_stock_to_the_count(): void
    {
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->add($matin, $this->baguette->id, 100, $this->cashier);
        $this->sell(30);

        $live = $this->line($matin);
        $this->assertEquals(30, $live['sold']);
        $this->assertEquals(70, $live['expected']);

        $this->assertRefused(fn () => $this->sheets->close($matin, [], $this->cashier), 'reste non saisi');
        $this->assertRefused(fn () => $this->sheets->close($matin, [$this->baguette->id => 71], $this->cashier), 'reste > disponible');

        $this->sheets->close($matin, [$this->baguette->id => 62], $this->cashier);

        $closed = $this->line($matin);
        $this->assertEquals(8, $closed['gap'], '70 attendues, 62 comptées');
        $this->assertEquals(62, $this->stockOf($this->baguette));
        $this->assertRefused(fn () => $this->sheets->add($matin, $this->baguette->id, 1, $this->cashier), 'équipe clôturée');
    }

    public function test_tolerance_set_by_the_manager_decides_what_is_flagged(): void
    {
        $this->store->update(['sheet_gap_tolerance_pct' => 5, 'sheet_gap_tolerance_qty' => 2]);
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->add($matin, $this->baguette->id, 100, $this->cashier);
        $this->sheets->close($matin, [$this->baguette->id => 96], $this->cashier); // écart 4 ≤ 5 % de 100

        $this->assertFalse($this->sheets->overTolerance($this->store->fresh(), $this->line($matin)));

        $this->store->update(['sheet_gap_tolerance_pct' => 3]);
        $this->assertTrue($this->sheets->overTolerance($this->store->fresh(), $this->line($matin)));
    }

    public function test_next_shift_starts_from_the_count_without_double_counting(): void
    {
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->add($matin, $this->baguette->id, 100, $this->cashier);
        $this->sheets->close($matin, [$this->baguette->id => 90], $this->cashier); // manquant 10

        // Ouverture dans la même seconde que la clôture précédente
        $soir = $this->open('soir', $this->baker);
        $line = $this->line($soir);

        $this->assertEquals(90, $line['opening']);
        $this->assertEquals(0, $line['other'], 'Le recalage du matin ne doit pas apparaître dans le soir');
        $this->assertEquals(90, $line['expected']);
    }

    public function test_night_leftover_bread_becomes_unsold_and_reopening_restores_it(): void
    {
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->add($matin, $this->baguette->id, 100, $this->cashier);
        $this->sheets->close($matin, [$this->baguette->id => 100], $this->cashier);
        $this->sheets->close($this->open('soir', $this->baker), [$this->baguette->id => 100], $this->baker);
        $nuit = $this->open('nuit', $this->cashier);

        $this->sheets->close($nuit, [$this->baguette->id => 40], $this->cashier, 'donation');

        $this->assertEquals(0, $this->stockOf($this->baguette), 'Le pain restant part en invendus');
        $report = UnsoldReport::with('lines')->findOrFail($nuit->fresh()->unsold_report_id);
        $this->assertEquals(40, $report->lines->first()->qty);
        $this->assertEquals('donation', $report->lines->first()->destination);

        $this->assertRefused(fn () => $this->sheets->reopen($nuit->fresh(), $this->cashier), 'réouverture par le caissier');

        $this->sheets->reopen($nuit->fresh(), $this->user);
        $this->assertEquals('open', $nuit->fresh()->status);
        $this->assertEquals(100, $this->stockOf($this->baguette), 'Invendus et écart annulés');
        $this->assertNull(UnsoldReport::find($report->id));
    }

    public function test_an_earlier_shift_cannot_be_reopened_once_a_later_one_exists(): void
    {
        $matin = $this->open('matin', $this->cashier);
        $this->sheets->close($matin, [], $this->cashier);
        $this->open('soir', $this->baker);
        $this->sheets->close(SheetShift::where('shift', 'soir')->first(), [], $this->baker);

        $this->assertRefused(fn () => $this->sheets->reopen($matin->fresh(), $this->user), 'le soir existe déjà');
    }
}
