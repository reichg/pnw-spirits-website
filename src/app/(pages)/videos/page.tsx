// Server component: the archive's page lives in the URL, so a paged view is
// shareable and crawlable rather than hidden behind client state.
import ContentArchiveLayout from "@/components/ui/ContentArchiveLayout";
import {
  ARCHIVE_PAGE_PARAM,
  ARCHIVE_PAGE_SIZE,
  archiveEmptyState,
  archiveResultCount,
  buildArchiveHref,
  parseArchivePage,
  type ArchiveNoun,
} from "@/utils/contentArchive";
import { SITE_ORIGIN } from "@/utils/contentDetail";
import { toVideoItem, type VideoRecord } from "@/utils/contentItems";
import styles from "./VideosArchivePage.module.css";

const BASE_PATH = "/videos";

const NOUN: ArchiveNoun = { singular: "video", plural: "videos" };

async function fetchArchiveVideos(
  page: number,
): Promise<{ videos: VideoRecord[]; total: number; totalPages: number }> {
  // No search param, unlike the other two archives: /api/videos pages a cached
  // YouTube response and has no search capability, and filtering only the page
  // already in hand would be a search box that searches a twelfth of the channel.
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(ARCHIVE_PAGE_SIZE),
  });

  // Both failure modes converge on the layout's empty state instead of a 500:
  // `!res.ok` catches a clean error response - this route answers 400 whenever
  // the YouTube key or channel id is absent, which is the common local case -
  // and the catch block catches a network failure or an unparseable body.
  // Collapsing either guard reintroduces a crash.
  //
  // Both report `total: NaN` rather than 0, which is deliberate and is not a
  // bug to tidy away: a failed fetch does not know how many videos the channel
  // holds, and 0 would put "0 videos" in the header - the page asserting an
  // empty channel when the truth is merely unknown, with no way for a reader to
  // tell the two apart. That matters most here, because the 400 above is the
  // ordinary local-dev state. NaN is the unknowable count archiveResultCount
  // drops. A real 0 from a request that succeeded still renders "0 videos",
  // because that is a true inventory statement.
  try {
    const res = await fetch(`${SITE_ORIGIN}/api/videos?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return { videos: [], total: Number.NaN, totalPages: 1 };
    const data = await res.json();
    const videos: VideoRecord[] = data.videos || [];
    // `total` is the size of the whole channel listing and `totalPages` the
    // count of pages over it - two different numbers on this route, where the
    // other two archives send only the former. The header counts videos, so it
    // reads `total`; using `totalPages` there would headline "5 videos" above
    // five pages of twelve.
    return {
      videos,
      total: Number(data.total),
      totalPages: Math.max(1, data.totalPages || 1),
    };
  } catch {
    // NaN, not 0, for the reason given above: an unknowable count, not an
    // empty channel.
    return { videos: [], total: Number.NaN, totalPages: 1 };
  }
}

const VideosArchivePage = async ({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const params = await searchParams;
  // searchParams is user input: parsed and clamped here, re-encoded on the way
  // back out by buildArchiveHref, and never interpolated raw into a URL.
  const requestedPage = parseArchivePage(params[ARCHIVE_PAGE_PARAM]);

  const { videos, total, totalPages } = await fetchArchiveVideos(requestedPage);
  // Synchronous, unlike the other two archives: YouTube hands back absolute
  // thumbnail URLs, so there is no stored S3 key to sign and nothing for
  // mapWithSignedImageUrl to do but add a cache round-trip per row.
  const items = videos.map(toVideoItem);
  // The pager reports a page that exists, so ?page=999 still offers a way back
  // into range instead of stranding the reader on a dead page.
  const page = Math.min(requestedPage, totalPages);
  // Always the unfiltered form: this archive has no search control, so the
  // "no-results" state is unreachable here.
  const emptyState = archiveEmptyState({
    query: "",
    requestedPage,
    totalPages,
  });

  return (
    <ContentArchiveLayout
      className={styles.videosArchiveRoot}
      columns={2}
      backLink={{ href: "/videos-landing", label: "Videos" }}
      heading="All Videos"
      // Never carries a search term: this archive has no search control.
      resultCount={archiveResultCount({ total, noun: NOUN, query: "" })}
      items={items}
      emptyMessage={
        emptyState === "page-out-of-range"
          ? "That page is past the end of the channel. Head back a page to keep watching."
          : "There aren't any videos yet. Check back soon for new content!"
      }
      page={page}
      totalPages={totalPages}
      hrefForPage={(target: number) =>
        buildArchiveHref(BASE_PATH, { page: target })
      }
    />
  );
};

export default VideosArchivePage;
