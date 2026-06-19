import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so the service never touches a real client/DB.
// The default export is the prisma instance; each model gets vi.fn() methods.
// vi.hoisted lets these mocks exist before the hoisted vi.mock factories run.
const { prismaMock, deleteS3Objects } = vi.hoisted(() => ({
  prismaMock: {
    cocktailClass: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    classSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    classPhoto: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  deleteS3Objects: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: prismaMock,
}));

vi.mock("@/utils/s3", () => ({
  deleteS3Objects,
}));

// Silence structured logging during tests.
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createPhoto,
  createSession,
  deletePhoto,
  getClassPage,
  getSingletonClassId,
  updatePhoto,
} from "./classService";
import { ClassNotFoundError, NoClassPageError } from "./classErrors";

const SINGLETON = { id: 1, title: "T", description: "D" };

beforeEach(() => {
  vi.clearAllMocks();
  deleteS3Objects.mockResolvedValue({ deleted: [], errors: [] });
});

describe("getClassPage", () => {
  it("returns an empty shape when no class page exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    const result = await getClassPage();

    expect(result).toEqual({ class: null, sessions: [], photos: [] });
    // Must not query children when the singleton is absent.
    expect(prismaMock.classSession.findMany).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.findMany).not.toHaveBeenCalled();
  });

  it("returns the class with its sessions and photos when it exists", async () => {
    const sessions = [{ id: 10 }];
    const photos = [{ id: 20 }];
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classSession.findMany.mockResolvedValue(sessions);
    prismaMock.classPhoto.findMany.mockResolvedValue(photos);

    const result = await getClassPage();

    expect(result).toEqual({ class: SINGLETON, sessions, photos });
    expect(prismaMock.classSession.findMany).toHaveBeenCalledWith({
      where: { classId: SINGLETON.id },
      orderBy: { startTime: "asc" },
    });
    expect(prismaMock.classPhoto.findMany).toHaveBeenCalledWith({
      where: { classId: SINGLETON.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  });
});

describe("getSingletonClassId", () => {
  it("returns the id when a singleton class row exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue({ id: SINGLETON.id });

    await expect(getSingletonClassId()).resolves.toBe(SINGLETON.id);
    // Selects only the id to avoid over-fetching the full row.
    expect(prismaMock.cocktailClass.findFirst).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: { id: true },
    });
  });

  it("returns null when no class page exists (non-throwing)", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(getSingletonClassId()).resolves.toBeNull();
  });
});

describe("createSession", () => {
  it("throws NoClassPageError when no singleton class exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(
      createSession({ startTime: new Date("2026-07-01T18:30:00.000Z") }),
    ).rejects.toBeInstanceOf(NoClassPageError);
    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
  });

  it("creates a session against the singleton class id", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classSession.create.mockResolvedValue({ id: 99 });
    const startTime = new Date("2026-07-01T18:30:00.000Z");

    await createSession({ startTime });

    expect(prismaMock.classSession.create).toHaveBeenCalledWith({
      data: { classId: SINGLETON.id, startTime, endTime: null, location: null },
    });
  });
});

describe("createPhoto", () => {
  it("throws NoClassPageError when no singleton class exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(
      createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(NoClassPageError);
    expect(prismaMock.classPhoto.create).not.toHaveBeenCalled();
  });

  it("creates a photo against the singleton class id", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classPhoto.create.mockResolvedValue({ id: 50 });

    await createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 2 });

    expect(prismaMock.classPhoto.create).toHaveBeenCalledWith({
      data: {
        classId: SINGLETON.id,
        s3Key: "uploads/a.jpg",
        caption: null,
        sortOrder: 2,
      },
    });
  });
});

describe("deletePhoto", () => {
  it("throws ClassNotFoundError when the row does not exist", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue(null);

    await expect(deletePhoto(7)).rejects.toBeInstanceOf(ClassNotFoundError);
    expect(prismaMock.classPhoto.delete).not.toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });

  it("deletes the row then removes the backing S3 object by its key", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/old.jpg",
    });
    prismaMock.classPhoto.delete.mockResolvedValue({ id: 7 });

    await deletePhoto(7);

    expect(prismaMock.classPhoto.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(deleteS3Objects).toHaveBeenCalledWith(["uploads/old.jpg"]);
  });
});

describe("updatePhoto", () => {
  it("throws ClassNotFoundError when the row does not exist", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue(null);

    await expect(
      updatePhoto(7, { s3Key: "uploads/new.jpg", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(ClassNotFoundError);
    expect(prismaMock.classPhoto.update).not.toHaveBeenCalled();
  });

  it("deletes the OLD key only when s3Key changed", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/old.jpg",
    });
    prismaMock.classPhoto.update.mockResolvedValue({ id: 7 });

    await updatePhoto(7, { s3Key: "uploads/new.jpg", sortOrder: 0 });

    expect(deleteS3Objects).toHaveBeenCalledTimes(1);
    expect(deleteS3Objects).toHaveBeenCalledWith(["uploads/old.jpg"]);
  });

  it("does NOT delete from S3 when s3Key is unchanged", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/same.jpg",
    });
    prismaMock.classPhoto.update.mockResolvedValue({ id: 7 });

    await updatePhoto(7, { s3Key: "uploads/same.jpg", sortOrder: 1 });

    expect(prismaMock.classPhoto.update).toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });
});
