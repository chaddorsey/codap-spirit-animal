/**
 * fixture.js — the Mammals test dataset, created through the API.
 *
 * Deterministic and offline: 12 rows shaped like CODAP's Mammals example —
 * a numeric `Mass` with one far outlier (African Elephant, 6654), a numeric
 * `Sleep`, and a categorical `Order`. This is the shape docs/BAT-A-POINT.md
 * calibrated against and the one every Phase 9 demo is developed on.
 *
 * The numeric values are LOAD-BEARING: four committed verification scripts
 * under docs/verification/wonderings/ quote measurements taken from them.
 * Changing a number silently invalidates those measurements.
 *
 * `Diet` added 2026-08-28 (plan -002, wave W0). Measured 2026-08-28, the
 * fixture's only other non-identifier categorical, `Order`, has 7 groups over
 * 12 cases with a smallest group of 1 — too many groups to compare honestly —
 * so the comparison, grouping and filtering wondering families earned NOTHING
 * on the dataset the tutorials actually ship. `Mammal` is worse: cardinality
 * 12 over 12 cases, an identifier. `Diet` is the cheapest fix in the plan:
 * 3 biologically-correct groups over 12 cases, smallest group 3, which clears
 * both the group-count ceiling (<= 4) and the min-group-size floor (>= 3) and
 * unblocks three families at once. Sizes: plant 5, meat 4, both 3. Insect
 * eaters (Big Brown Bat) count as `meat`; `both` is omnivory.
 */
export const MAMMALS = [
  { Mammal: 'African Elephant', Order: 'Proboscidae', Diet: 'plant', LifeSpan: 70, Height: 4.0, Mass: 6654, Sleep: 3.3, Speed: 40 },
  { Mammal: 'Asian Elephant', Order: 'Proboscidae', Diet: 'plant', LifeSpan: 70, Height: 3.0, Mass: 2547, Sleep: 3.9, Speed: 40 },
  { Mammal: 'Big Brown Bat', Order: 'Chiroptera', Diet: 'meat', LifeSpan: 19, Height: 0.06, Mass: 0.023, Sleep: 19.7, Speed: 40 },
  { Mammal: 'Chimpanzee', Order: 'Primate', Diet: 'both', LifeSpan: 40, Height: 1.5, Mass: 52.2, Sleep: 9.7, Speed: 16 },
  { Mammal: 'Cow', Order: 'Artiodactyla', Diet: 'plant', LifeSpan: 22, Height: 1.5, Mass: 465, Sleep: 3.9, Speed: 40 },
  { Mammal: 'Donkey', Order: 'Perissodactyla', Diet: 'plant', LifeSpan: 40, Height: 1.2, Mass: 187, Sleep: 3.1, Speed: 50 },
  { Mammal: 'Giraffe', Order: 'Artiodactyla', Diet: 'plant', LifeSpan: 25, Height: 5.6, Mass: 900, Sleep: 1.9, Speed: 51 },
  { Mammal: 'Gray Wolf', Order: 'Carnivora', Diet: 'meat', LifeSpan: 16, Height: 0.8, Mass: 36, Sleep: 13.0, Speed: 64 },
  { Mammal: 'Human', Order: 'Primate', Diet: 'both', LifeSpan: 80, Height: 1.9, Mass: 62, Sleep: 8.0, Speed: 45 },
  { Mammal: 'Jaguar', Order: 'Carnivora', Diet: 'meat', LifeSpan: 20, Height: 0.8, Mass: 100, Sleep: 10.4, Speed: 60 },
  { Mammal: 'Lion', Order: 'Carnivora', Diet: 'meat', LifeSpan: 15, Height: 1.2, Mass: 175, Sleep: 13.5, Speed: 80 },
  { Mammal: 'Mouse', Order: 'Rodent', Diet: 'both', LifeSpan: 3, Height: 0.1, Mass: 0.023, Sleep: 12.5, Speed: 13 },
];

export const MAMMALS_COLLECTION = {
  name: 'Mammals', title: 'Mammals',
  attrs: [
    { name: 'Mammal', type: 'categorical' },
    { name: 'Order', type: 'categorical' },
    { name: 'Diet', type: 'categorical' },
    { name: 'LifeSpan', type: 'numeric' },
    { name: 'Height', type: 'numeric' },
    { name: 'Mass', type: 'numeric' },
    { name: 'Sleep', type: 'numeric' },
    { name: 'Speed', type: 'numeric' },
  ],
};

/**
 * The dataset Dot "carries in" for tutorial 1's `Drag` task.
 *
 * That task asks the student to drag a CSV file into CODAP, and no page can
 * synthesise a real file drop — so `carrycsv` is fallback-first BY DESIGN
 * (scope review): Dot carries a CSV ghost card to the drop point and the
 * bridge API commits the import at touch-down, opening a case table exactly
 * as a real drop would. Deliberately a DIFFERENT dataset from the Mammals
 * fixture, so the demo's import is visibly its own and its revert is
 * unambiguous.
 */
export const DEMO_CSV = {
  context: {
    name: 'Cats', title: 'Cats',
    collections: [{
      name: 'Cats', title: 'Cats',
      attrs: [
        { name: 'Name', type: 'categorical' },
        { name: 'Coat', type: 'categorical' },
        { name: 'Weight', type: 'numeric' },
        { name: 'Age', type: 'numeric' },
      ],
    }],
  },
  items: [
    { Name: 'Biscuit', Coat: 'tabby', Weight: 4.2, Age: 3 },
    { Name: 'Domino', Coat: 'tuxedo', Weight: 5.1, Age: 7 },
    { Name: 'Marmalade', Coat: 'ginger', Weight: 5.9, Age: 2 },
    { Name: 'Pepper', Coat: 'grey', Weight: 3.8, Age: 5 },
    { Name: 'Willow', Coat: 'calico', Weight: 4.6, Age: 1 },
  ],
};

/**
 * Create the dataset and its case table if they are not already there.
 * `api` is any `(action, resource, values) => Promise<reply>` with
 * get-verify-retry built in.
 */
export async function ensureMammals(api, { force = false } = {}) {
  const existing = await api('get', 'dataContext[Mammals]');
  if (existing?.success && force) await api('delete', 'dataContext[Mammals]');
  if (!existing?.success || force) {
    const created = await api('create', 'dataContext', {
      name: 'Mammals', title: 'Mammals', collections: [MAMMALS_COLLECTION],
    });
    if (!created?.success) throw new Error(`fixture: ${JSON.stringify(created?.values)}`);
    const added = await api('create', 'dataContext[Mammals].item', MAMMALS);
    if (!added?.success) throw new Error(`fixture items: ${JSON.stringify(added?.values)}`);
  }
  const list = await api('get', 'componentList');
  const table = (list?.values ?? []).find((c) => /caseTable/i.test(c.type));
  if (table) return table.id;
  const made = await api('create', 'component', {
    type: 'caseTable', dataContext: 'Mammals', name: 'Mammals table',
    position: { left: 6, top: 6 }, dimensions: { width: 520, height: 250 },
  });
  if (!made?.success) throw new Error(`fixture table: ${JSON.stringify(made?.values)}`);
  return made.values.id;
}
