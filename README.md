# The PNW Spirits Website

## Overview

The PNW Spirits is a modern, cozy, and professional website inspired by the speakeasy era, designed to showcase Pacific Northwest spirits, blogs, videos, and community engagement. The site is built with a focus on warmth, elegance, and responsiveness, ensuring a seamless experience across desktop and mobile devices.

### Key Features

- **Blog & Recipe System:** Landing pages and full archives for blogs and recipes, with admin editing.
- **Video Gallery:** Curated video lists and integration with YouTube API for dynamic content.
- **Classes:** Session scheduling, photo albums, and a contact form for enquiries.
- **Subscriber Management:** Subscribe forms and a newsletter composer that broadcasts to subscribers.
- **Admin Dashboard:** Secure login, plus sections for blogs, recipes, classes, and the newsletter.
- **Commenting & Reactions:** _Not currently mounted._ `CommentSection` and `ReactionBar` exist alongside `/api/comments` and `/api/reactions`, but no page renders them today.
- **Contact Page:** Professional contact form for inquiries and feedback.
- **Media Uploads:** S3 integration for secure media uploads and management.
- **Responsive Layout:** All UI elements adapt gracefully to any screen size.

### Design Philosophy

- **Warm & Cozy Vibe:** All styling uses global theme colors from `globals.css` to maintain a speakeasy-inspired, inviting atmosphere.
- **Professional & Elegant:** Modern sans-serif fonts (Geist, Inter) and clean layouts ensure a polished look.
- **Modular Components:** Each UI element is a focused, reusable React component with strict TypeScript types.
- **Separation of Concerns:** Styling is handled via CSS modules per component, keeping logic and presentation clean.

### Tech Stack

- **Next.js & React:** Functional components and hooks for fast, modular development.
- **TypeScript:** Strict typing for reliability and maintainability.
- **Prisma:** Database ORM for robust data management.
- **AWS S3:** Media storage and uploads.
- **Redis:** Caching and performance optimization.
- **Postman:** API testing and documentation.
- **Docker:** `docker-compose.yml` runs the local PostgreSQL and Redis services. There is no application Dockerfile; the app itself is not containerized.

### Toolchain & Developer Setup

This project uses a pinned, modern toolchain. All dependencies are pinned to exact versions — no `^` or `~` ranges — and the package manager, runtime, and CI action versions are pinned too. There is no automated dependency bot configured; updates arrive as explicit, reviewable version bumps.

- **Node 24 LTS** — pinned via `.nvmrc` and the `engines` field in `package.json`. Run `nvm use` (or `nvm install`) to match the expected version.
- **pnpm 10** — the only supported package manager (`pnpm-lock.yaml` is committed; there is no `package-lock.json`). Use `pnpm` for all commands. Install dependencies with:

  ```
  pnpm install
  ```

- **ESLint flat config** — a single flat config (`eslint.config.*`) drives linting; the legacy `.eslintrc.json` has been removed.
- **Prisma 7** — database ORM and migrations.

#### Available Scripts

| Command             | Description                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Start the development server (listens on 0.0.0.0).                                                                                                             |
| `pnpm build`        | Build the production app.                                                                                                                                      |
| `pnpm start`        | Run the production build.                                                                                                                                      |
| `pnpm lint`         | Lint the codebase with ESLint.                                                                                                                                 |
| `pnpm typecheck`    | Type-check with `tsc --noEmit`.                                                                                                                                |
| `pnpm test`         | Run the test suite with Vitest (`vitest run`).                                                                                                                 |
| `pnpm format`       | Format the codebase with Prettier.                                                                                                                             |
| `pnpm format:check` | Check formatting without writing changes.                                                                                                                      |
| `pnpm db:seed`      | Seed the database.                                                                                                                                             |
| `pnpm db:seed:demo` | Seed the database with demo content.                                                                                                                           |
| `pnpm screenshot`   | Capture screenshots from a running dev server, for design review — the public pages, or the admin set with `--admin`. Requires `pnpm dev` in another terminal. |

`pnpm screenshot --admin` captures the `/admin` route set instead. Those pages sit behind a client-side auth gate, so the run needs an admin JWT — supply it through the `SCREENSHOT_ADMIN_TOKEN` environment variable rather than the `--admin-token` flag, which lands in shell history. Run `pnpm screenshot --help` for the full flag list and a worked example of minting a token from the running dev server; a real token must never be pasted into a command you will print, share, or commit.

#### Prisma Commands

```
pnpm prisma validate         # validate the schema
pnpm prisma generate         # generate the Prisma client
pnpm prisma migrate dev      # create and apply a migration in development
pnpm prisma migrate deploy   # apply pending migrations (production/staging)
```

`prisma migrate` requires one of those subcommands; on its own it only prints help.

#### Continuous Integration

A CI workflow (`.github/workflows/ci.yml`) runs on pushes and pull requests to `master` and `dev`, and executes install, `prisma generate`, typecheck, lint, build, and test. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` locally before pushing to catch failures early.

### Local Network Access

To make the app available on your local network, the development server is configured to listen on all interfaces (0.0.0.0). Start the dev server with:

```
pnpm dev
```

Then access the app from other devices on your network using:

```
http://<your-local-ip>:3000
```

Replace `<your-local-ip>` with your computer's IP address (e.g., 192.168.1.100).

### Project Structure

- `src/app/` — Main app pages, layouts, and global styles.
- `src/app/api/` — API routes for admin, blogs, classes, comments, contact, media, reactions, recipes, subscribers, uploads, and videos. Routes stay thin and call into `src/services/`.
- `src/services/` — Backend business logic and domain rules (admin, classes, contact, content, demo, media). All business logic lives here rather than in route handlers.
- `src/components/` — Modular UI components (Class, Comment, Layout, Media, Reaction, Subscriber, and the shared `ui/` set).
- `src/hooks/` — Reusable React hooks.
- `src/config/` — Shared configuration values.
- `src/models/` — TypeScript models for videos and APIs.
- `src/utils/` — Utility functions (auth, email, logger, prisma, redis, s3, pagination, content helpers).
- `prisma/` — Database schema and migrations.
- `public/images/` — Static assets and images.
- `generated/prisma/` — Generated Prisma client files.
- `postman/` — API collections for testing.
- `docs/testing.md` — How the test suite is set up, what it can and cannot observe, and the conventions for writing assertions. Read before writing a component test.
- `docs/decision-log.md` — Why the architecture is the way it is, including alternatives that were considered and rejected.

### Styling & UI

- All colors and themes are defined in `globals.css` for consistency.
- Responsive design principles ensure usability on all devices.
- No duplicate styling tags or repeated CSS class definitions.
- Only modern, elegant sans-serif fonts are used.

### Development Guidelines

- Clean up unused code, imports, and styles after edits.
- Use descriptive, meaningful names for components, variables, and CSS classes.
- Document any non-obvious logic with concise comments.
- Keep components focused and modular—one responsibility per component.
- Ensure all UI is responsive and error-free after changes.

---

For more details on setup, contributing, or deployment, see the relevant sections below or contact the project maintainer.

---

## Getting Started for Non-Coders

If you are not familiar with coding, you can still get the PNW Spirits website running by following these simple steps:

### 1. Install Prerequisites

- **Install Node.js:**
  - Go to [nodejs.org](https://nodejs.org/) and download **Node 24 (LTS)** for your operating system. This project pins Node 24 via the `.nvmrc` file, so if you use `nvm` you can simply run `nvm install` then `nvm use` in the project folder.
- **Install pnpm:**
  - This project uses **pnpm 10** as its package manager. After installing Node, enable it with `corepack enable` (which ships with Node), or install it from [pnpm.io](https://pnpm.io/installation).
- **Install Docker (Required):**
  - Download and install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/).
  - Make sure Docker Desktop is running before continuing.

### 2. Download the Project

- Click the green "Code" button on the GitHub repository page and select "Download ZIP".
- Unzip the folder to your computer.

### 3. Open the Project Folder

- Open the unzipped folder using [Visual Studio Code](https://code.visualstudio.com/) or your preferred editor.

### 4. Install Dependencies

- Open a terminal in the project folder (in VS Code, click "Terminal" > "New Terminal").
- Type:
  - `pnpm install`
  - This will download everything the website needs to run.

### 5. Start Docker Services (Required)

- In the same terminal, type:
  - `docker-compose up -d`
- This will start all required backend services (such as the database and Redis) in the background.

### 6. Start the Website

- In the same terminal, type:
  - `pnpm dev`
- Wait for the message that the site is running (usually at `http://localhost:3000`).
- Open your web browser and go to that address.

### 7. Using the Admin Panel

- Go to `/admin` in your browser (e.g., `http://localhost:3000/admin`).
- Log in with the credentials provided by your project maintainer.
- You can now manage blogs, recipes, and classes, and send a newsletter to subscribers.

### 8. Uploading Media

- Use the admin panel to upload images and videos. Files are stored securely using AWS S3.

### 9. Need Help?

- If you get stuck, contact the project maintainer or check the FAQ section (if available).
- You do not need to write any code—just follow the steps above!

---

**Enjoy sharing the spirit of the Pacific Northwest!**
