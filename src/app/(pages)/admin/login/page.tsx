import Image from "next/image";

import AdminLogin from "./AdminLogin";
import styles from "./AdminLoginPage.module.css";

/**
 * The split: the sign-in panel on the left, a photograph on the right.
 *
 * NOT AdminPageLayout. That shell declares a left-aligned 1200px spine and a
 * two-band header, which is the right shape for a screen that has a title, a
 * primary action and a list under it. This one has a form and nothing else, and
 * hanging a form off the left edge of a 1200px spine with 800px of empty ground
 * beside it is not a composition. Login is the single admin surface where
 * centring is correct, so it declares its own shell.
 *
 * THE PHOTOGRAPH STAYS, AND IT IS NOT BLURRED. What this redesign deletes from
 * every other admin screen is the blurred SCRIM - a full-resolution JPEG decoded
 * at blur(4px) brightness(0.2) to produce something unreadable by construction -
 * not photography. Here there is no list to scan and no control to find, and
 * AdminHeader returns null at this path, so the page carries the brand alone;
 * a photograph is the cheapest way for it to do that and the only surface where
 * it costs nothing. Shown at full fidelity, as a plate beside the form rather
 * than a wash behind it.
 *
 * AND IT IS GONE BELOW 900px, not merely hidden. See .plate for the two
 * mechanisms that keep a phone from downloading a decorative JPEG in order to
 * sign in.
 *
 * A SERVER COMPONENT. Only the form needs client state; the shell, the brand
 * and the photograph are static, so they never enter the bundle.
 */
export default function AdminLoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.formColumn}>
        <AdminLogin />
      </div>

      {/* THE SOURCE CHANGED, and it was chosen by rendering rather than by
          filename. This page used Bottles.jpg, a landscape shelf shot; cropped
          to a 720x900 plate, `object-position: center` lands on two large,
          legible commercial labels, and half an admin door reading as a liquor
          advertisement is not this brand. Improvedverticalrecp.jpg is composed
          vertically, so the plate is its natural crop, and its subject is a
          DRINK on a near-black ground - which keeps the public system's own
          thesis (the photograph is the subject) and makes the seam with the
          form column nearly invisible, so the page reads as one warm-dark
          surface with a photograph emerging from it rather than as two panels.
          A third candidate, DaqVert.jpg, was rendered and rejected: correct
          crop, but a near-white studio background that turns half the viewport
          into the brightest surface in the product.

          Decorative, so alt="" and no aria-hidden on the wrapper - an empty alt
          already removes it from the accessibility tree, and a second
          suppression on the container is one more thing to keep true. */}
      <div className={styles.plate}>
        <Image
          className={styles.plateImage}
          src="/images/Improvedverticalrecp.jpg"
          alt=""
          fill
          sizes="(min-width: 900px) 50vw, 1px"
        />
      </div>
    </div>
  );
}
