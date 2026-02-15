import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignupForm from "../SignupForm.js";

/**
 * Unit tests for the simplified SignupForm component.
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 7.4**
 *
 * The SignupForm now collects only email and password.
 * Plan selector, name field, and TOS checkbox have been removed.
 * Implicit TOS text lives at the signup page level, not in this component.
 */

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Form fields", () => {
    it("renders email input field", () => {
      render(<SignupForm />);

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toBeDefined();
      expect(emailInput.getAttribute("type")).toBe("email");
      expect(emailInput.getAttribute("required")).toBe("");
    });

    it("renders password input field", () => {
      render(<SignupForm />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      expect(passwordInput).toBeDefined();
      expect(passwordInput.getAttribute("type")).toBe("password");
      expect(passwordInput.getAttribute("required")).toBe("");
      expect(passwordInput.getAttribute("minlength")).toBe("8");
    });

    it("renders password requirements hint", () => {
      render(<SignupForm />);

      const hint = screen.getByText(/min 8 characters/i);
      expect(hint).toBeDefined();
    });

    it("renders submit button", () => {
      render(<SignupForm />);

      const submitButton = screen.getByRole("button", { name: /create account/i });
      expect(submitButton).toBeDefined();
      expect(submitButton.getAttribute("type")).toBe("submit");
    });
  });

  describe("Removed fields — Requirements 1.3, 1.4, 1.5", () => {
    it("does not render a plan selector", () => {
      render(<SignupForm />);

      expect(screen.queryByText(/select a plan/i)).toBeNull();
      expect(screen.queryByText("$0/mo")).toBeNull();
      expect(screen.queryByText("$49/mo")).toBeNull();
      expect(screen.queryByText("$199/mo")).toBeNull();
    });

    it("does not render a name input field", () => {
      render(<SignupForm />);

      expect(screen.queryByLabelText(/^name$/i)).toBeNull();
    });

    it("does not render a TOS checkbox", () => {
      render(<SignupForm />);

      expect(screen.queryByRole("checkbox")).toBeNull();
    });

    it("does not contain implicit TOS text (lives at page level)", () => {
      render(<SignupForm />);

      expect(screen.queryByText(/by creating an account/i)).toBeNull();
      expect(screen.queryByText(/terms of service/i)).toBeNull();
      expect(screen.queryByText(/privacy policy/i)).toBeNull();
    });
  });

  describe("Form submission — Requirement 7.4", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("sends only email and password in the API payload", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      render(<SignupForm />);

      await user.type(screen.getByLabelText(/email address/i), "test@example.com");
      await user.type(screen.getByLabelText(/^password$/i), "Password123");
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "test@example.com", password: "Password123" }),
          })
        );
      });
    });

    it("does not send name, selectedPlan, or tosAccepted", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      render(<SignupForm />);

      await user.type(screen.getByLabelText(/email address/i), "user@co.com");
      await user.type(screen.getByLabelText(/^password$/i), "Secure99x");
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        const call = vi.mocked(global.fetch).mock.calls[0];
        const body = JSON.parse(call[1]?.body as string);
        expect(body).toEqual({ email: "user@co.com", password: "Secure99x" });
        expect(body).not.toHaveProperty("name");
        expect(body).not.toHaveProperty("selectedPlan");
        expect(body).not.toHaveProperty("tosAccepted");
      });
    });

    it("shows success message after successful signup", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      render(<SignupForm />);

      await user.type(screen.getByLabelText(/email address/i), "test@example.com");
      await user.type(screen.getByLabelText(/^password$/i), "Password123");
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText(/account created/i)).toBeDefined();
      });
    });

    it("shows error message on API failure", async () => {
      const user = userEvent.setup();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Email already in use" }),
      } as Response);

      render(<SignupForm />);

      await user.type(screen.getByLabelText(/email address/i), "taken@example.com");
      await user.type(screen.getByLabelText(/^password$/i), "Password123");
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText("Email already in use")).toBeDefined();
      });
    });
  });
});
