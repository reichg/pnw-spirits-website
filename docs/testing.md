# Recipe Search Test Coverage

## API Unit Tests

- `src/test/recipes-api.test.ts`: Verifies that the recipes API search logic correctly filters recipes by text fields (title, description, ingredients, instructions).
- Tests include:
  - No search param returns all recipes
  - Search param filters by each field

## Recipe Cache Invalidation Tests

- `src/test/recipes-api.test.ts`: Regression tests verify cache invalidation for recipe create, update, and delete operations.
- Tests mock the cache and check that `invalidateRecipeCache` is called for each mutation.
- Backend logic: Cache invalidation is triggered in the mutation handler (server action or API route) immediately after a successful DB write.
- Test coverage includes:
  - Creating a recipe and confirming cache refresh
  - Updating a recipe and confirming cache refresh
  - Deleting a recipe and confirming cache refresh
  - Ensuring no stale data is served after mutations

## RecipeList Component Tests

- `src/test/RecipeList.test.tsx`: Ensures RecipeList search input updates the list and is accessible.
- Tests include:
  - Accessible search input and label
  - List updates on search
  - Shows 'No recipes found' for unmatched search
  - Keyboard shortcut '/' focuses input

## Accessibility

- Search input is labeled and keyboard accessible.

## Admin Cover Photo Removal Workflow

- Admin blog/recipe editors: 'Remove cover photo' button is keyboard accessible, ARIA-labeled, and placeholder state is announced for screen readers.
- Removal workflow: API payload includes `coverPhoto: null` only if marked for removal; undo is possible before saving.

## How to run

[...existing code...]

---

## Expanded Recipe Search Testing

### API Tests

- Unit tests for `/api/recipes/search` endpoint:
  - Validates query parameter handling and zod schema enforcement.
  - Checks filtering logic for name, ingredients, and tags.
  - Ensures correct error responses for invalid input.

### UI Tests

- Component tests for search input and results list:
  - Verifies accessibility (label, keyboard navigation, ARIA roles).
  - Checks rendering of filtered recipes.
  - Regression tests for edge cases (empty results, invalid input).

### E2E Tests

- Simulate user search flows:
  - Enter search terms, select filters, verify results.
  - Confirm accessibility and error handling in real browser context.
- `npm test` (unit/component)
- E2E: Add Playwright tests for full recipe search journey if needed.
