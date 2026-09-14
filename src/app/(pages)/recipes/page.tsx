// Server component: the archive's page and search term live in the URL, so
// cover photos are signed and rendered server-side, and a filtered or paged
// view is shareable and crawlable rather than hidden behind client state.
import ContentArchiveLayout from "@/components/ui/ContentArchiveLayout";
import ContentArchiveSearch from "@/components/ui/ContentArchiveSearch";
import { mapWithSignedImageUrl } from "@/services/media/signedImageService";
import {
  ARCHIVE_PAGE_PARAM,
  ARCHIVE_PAGE_SIZE,
  ARCHIVE_QUERY_PARAM,
  archiveEmptyState,
  archiveResultCount,
  buildArchiveHref,
  parseArchivePage,
  parseArchiveQuery,
  totalPagesFor,
  type ArchiveEmptyState,
  type ArchiveNoun,
} from "@/utils/contentArchive";
import { SITE_ORIGIN } from "@/utils/contentDetail";
import { toRecipeItem, type RecipeRecord } from "@/utils/contentItems";
import Link from "next/link";
import styles from "./RecipesArchivePage.module.css";

const BASE_PATH = "/recipes";

const NOUN: ArchiveNoun = { singular: "recipe", plural: "recipes" };

async function fetchArchiveRecipes(
  page: number,
  query: string,
): Promise<{ recipes: RecipeRecord[]; total: number; totalPages: number }> {
  // The URL spells the search term `q`; /api/recipes spells the same thing
  // `search`. That translation happens here and nowhere else.
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(ARCHIVE_PAGE_SIZE),
  });
  if (query) params.set("search", query);

  // Both failure modes converge on the layout's empty state instead of a 500:
  // `!res.ok` catches a clean error response, the catch block catches a network
  // failure or an unparseable body. Collapsing either guard reintroduces a crash.
  //
  // Both report `total: NaN` rather than 0, which is deliberate and is not a
  // bug to tidy away: a failed fetch does not know how many recipes exist, and
  // 0 would put "0 recipes" in the header - the page asserting an empty archive
  // when the truth is merely unknown, with no way for a reader to tell the two
  // apart. NaN is the unknowable count archiveResultCount drops. A real 0 from
  // a request that succeeded and matched nothing still renders "0 recipes",
  // because that is a true inventory statement.
  try {
    const res = await fetch(`${SITE_ORIGIN}/api/recipes?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return { recipes: [], total: Number.NaN, totalPages: 1 };
    const data = await res.json();
    const recipes: RecipeRecord[] = data.recipes || [];
    // The count for the whole filter, not for this page: a missing or
    // non-numeric `total` becomes NaN here and is dropped downstream by both
    // totalPagesFor and archiveResultCount.
    const total = Number(data.total);
    return {
      recipes,
      total,
      totalPages: totalPagesFor(total, ARCHIVE_PAGE_SIZE),
    };
  } catch {
    // NaN, not 0, for the reason given above: an unknowable count, not an
    // empty archive.
    return { recipes: [], total: Number.NaN, totalPages: 1 };
  }
}

// Takes no term: the header's result count already names what was searched for,
// and stating it again one line later says the same thing twice. This sentence
// is the advice half of that pair.
function emptyMessageFor(state: ArchiveEmptyState): string {
  switch (state) {
    case "no-results":
      return "No recipes match that search. Try a shorter one, or clear it to see the whole bar.";
    case "page-out-of-range":
      return "That page is past the end of the bar. Head back a page to keep pouring.";
    default:
      return "There aren't any recipes yet. Check back soon for new cocktails and inspiration!";
  }
}

const RecipesArchivePage = async ({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const params = await searchParams;
  // searchParams is user input: parsed and clamped here, re-encoded on the way
  // back out by buildArchiveHref, and never interpolated raw into a URL.
  const requestedPage = parseArchivePage(params[ARCHIVE_PAGE_PARAM]);
  const query = parseArchiveQuery(params[ARCHIVE_QUERY_PARAM]);

  const { recipes, total, totalPages } = await fetchArchiveRecipes(
    requestedPage,
    query,
  );
  // Cover photos are signed here, on the server, and in parallel; see
  // mapWithSignedImageUrl for why the client path is not good enough.
  const items = await mapWithSignedImageUrl(
    recipes,
    (recipe) => recipe.coverPhoto,
    toRecipeItem,
  );
  // The pager reports a page that exists, so ?page=999 still offers a way back
  // into range instead of stranding the reader on a dead page.
  const page = Math.min(requestedPage, totalPages);
  const emptyState = archiveEmptyState({ query, requestedPage, totalPages });

  return (
    <ContentArchiveLayout
      className={styles.recipesArchiveRoot}
      backLink={{ href: "/recipes-landing", label: "Recipes" }}
      heading="All Recipes"
      resultCount={archiveResultCount({ total, noun: NOUN, query })}
      items={items}
      emptyMessage={emptyMessageFor(emptyState)}
      controls={
        <>
          <ContentArchiveSearch
            basePath={BASE_PATH}
            query={query}
            label="Search recipes"
            placeholder="Search recipes"
          />
          {query !== "" && (
            <Link
              className={styles.clearSearch}
              href={buildArchiveHref(BASE_PATH, {})}
            >
              Clear search
            </Link>
          )}
        </>
      }
      page={page}
      totalPages={totalPages}
      hrefForPage={(target: number) =>
        buildArchiveHref(BASE_PATH, { page: target, query })
      }
    />
  );
};

export default RecipesArchivePage;
