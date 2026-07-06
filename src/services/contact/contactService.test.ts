import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the collaborators so the service never sends real email or writes real
// logs. vi.hoisted lets these mocks exist before the hoisted vi.mock factories
// run, matching the style used in classService.test.ts.
const { sendContactEmail, logger } = vi.hoisted(() => ({
  sendContactEmail: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/utils/email", () => ({
  sendContactEmail,
}));

vi.mock("@/utils/logger", () => ({
  logger,
}));

import { submitContactMessage } from "./contactService";
import { CONTACT_CATEGORY_LABELS } from "./contactSchemas";

const validInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  category: "hire_event" as const,
  message: "I would like to book an event.",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendContactEmail.mockResolvedValue(undefined);
});

describe("submitContactMessage", () => {
  it("returns invalid with non-empty issues and does not send on bad input", async () => {
    const result = await submitContactMessage({ ...validInput, email: "bad" });

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("returns sent and delivers the message with the resolved category label", async () => {
    const result = await submitContactMessage(validInput);

    expect(result).toEqual({ status: "sent" });
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
    expect(sendContactEmail).toHaveBeenCalledWith({
      name: validInput.name,
      email: validInput.email,
      phone: validInput.phone,
      // The service resolves the human-readable label from the shared map
      // rather than passing the raw enum value.
      categoryLabel: CONTACT_CATEGORY_LABELS.hire_event,
      message: validInput.message,
    });
  });

  it("re-throws and logs an error when delivery fails", async () => {
    const failure = new Error("smtp down");
    sendContactEmail.mockRejectedValueOnce(failure);

    await expect(submitContactMessage(validInput)).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledTimes(1);
    // Success log must not run when delivery throws.
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs only coarse category info on success, never raw PII", async () => {
    await submitContactMessage(validInput);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [, options] = logger.info.mock.calls[0];
    // Only the coarse category enum is logged as data.
    expect(options.data).toEqual({ category: validInput.category });

    // Defensively assert no PII string leaked into the entire logged payload.
    const serialized = JSON.stringify(logger.info.mock.calls[0]);
    expect(serialized).not.toContain(validInput.email);
    expect(serialized).not.toContain(validInput.name);
    expect(serialized).not.toContain(validInput.message);
    expect(serialized).not.toContain(validInput.phone);
  });
});
