/**
 * Markdown token patterns shared by the content services.
 *
 * Both services lift `![alt](destination)` tokens out of admin-typed free text,
 * and both got the destination wrong in the same way, so the pattern lives here
 * rather than in either of them.
 *
 * Exported as pattern *sources* rather than `RegExp` objects: each call site
 * needs its own flags, and a shared global regex would carry `lastIndex`
 * between modules.
 */

/**
 * A markdown destination — the `(...)` of a link or image — tolerating one
 * level of nested parentheses, and capturing what is inside them.
 *
 * A flat `[^)]*` stops at the first `)`, truncating any destination that
 * contains one. Both realistic sources are ordinary content rather than
 * contrivance: a Wikipedia disambiguation URL (`.../wiki/Gin_(spirit)`), and an
 * uploaded filename (`IMG(1).jpg`, which Windows and most browsers generate for
 * a duplicate download). The damage is silent — a key cut short, so the image
 * never resolves, and the leftover tail stranded in the surrounding prose.
 *
 * The two alternatives cannot match the same character, so the outer repetition
 * has one unambiguous parse and cannot backtrack badly.
 */
export const MARKDOWN_DESTINATION = String.raw`\(((?:[^()]|\([^()]*\))*)\)`;

/**
 * An image token: alt text as group 1, the destination as group 2.
 *
 * Alt keeps a flat `[^\]]*` deliberately. A bracket inside alt text makes the
 * token fail to match and render as literal markdown — a failure its author
 * sees in the post immediately — rather than silently corrupting the key the
 * way a truncated destination does, and every stored token carries the editor's
 * fixed `image` placeholder as its alt anyway.
 */
export const MARKDOWN_IMAGE_TOKEN = String.raw`!\[([^\]]*)\]${MARKDOWN_DESTINATION}`;
