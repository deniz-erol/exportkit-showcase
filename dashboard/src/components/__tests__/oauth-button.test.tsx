import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signIn } from "next-auth/react";
import OAuthButton from "../OAuthButton.js";

/**
 * Unit tests for OAuthButton component
 * **Validates: Requirements 3.1, 3.3**
 *
 * Tests user interactions and component behavior:
 * - Button click triggers signIn() with correct provider
 * - Loading state during OAuth flow
 * - Disabled state prevents multiple clicks
 */

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("OAuthButton Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Button click triggers signIn() with correct provider", () => {
    it("calls signIn with google provider when Google button is clicked", async () => {
      const user = userEvent.setup();
      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/dashboard" });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("calls signIn with github provider when GitHub button is clicked", async () => {
      const user = userEvent.setup();
      render(<OAuthButton provider="github" mode="signin" />);

      const button = screen.getByRole("button", { name: /sign in with github/i });
      await user.click(button);

      expect(signIn).toHaveBeenCalledWith("github", { callbackUrl: "/dashboard" });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("calls signIn with microsoft provider when Microsoft button is clicked", async () => {
      const user = userEvent.setup();
      render(<OAuthButton provider="microsoft" mode="signin" />);

      const button = screen.getByRole("button", { name: /sign in with microsoft/i });
      await user.click(button);

      expect(signIn).toHaveBeenCalledWith("microsoft", { callbackUrl: "/dashboard" });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("uses correct callback URL for all providers", async () => {
      const user = userEvent.setup();
      const providers: Array<"google" | "github" | "microsoft"> = ["google", "github", "microsoft"];

      for (const provider of providers) {
        vi.clearAllMocks();
        const { unmount } = render(<OAuthButton provider={provider} mode="signin" />);

        const button = screen.getByRole("button");
        await user.click(button);

        expect(signIn).toHaveBeenCalledWith(provider, { callbackUrl: "/dashboard" });
        
        unmount();
      }
    });
  });

  describe("Loading state during OAuth flow", () => {
    it("shows loading spinner when signIn is called", async () => {
      const user = userEvent.setup();
      // Make signIn return a pending promise
      vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      // Loading spinner should be visible
      await waitFor(() => {
        const spinner = screen.getByRole("button").querySelector("svg");
        expect(spinner).toBeInTheDocument();
        expect(spinner).toHaveClass("animate-spin");
      });
    });

    it("hides provider icon and text during loading", async () => {
      const user = userEvent.setup();
      vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));

      render(<OAuthButton provider="google" mode="signin" />);

      // Initially shows text
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();

      const button = screen.getByRole("button");
      await user.click(button);

      // Text should be hidden during loading
      await waitFor(() => {
        expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
      });
    });

    it("restores button content when signIn fails", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      vi.mocked(signIn).mockRejectedValue(new Error("OAuth error"));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      // Should restore button text after error
      await waitFor(() => {
        expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Disabled state prevents multiple clicks", () => {
    it("disables button during OAuth flow", async () => {
      const user = userEvent.setup();
      vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();

      await user.click(button);

      // Button should be disabled after click
      await waitFor(() => {
        expect(button).toBeDisabled();
      });
    });

    it("prevents multiple signIn calls when clicked rapidly", async () => {
      const user = userEvent.setup();
      vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button");

      // Try to click multiple times rapidly
      await user.click(button);
      await user.click(button);
      await user.click(button);

      // signIn should only be called once
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("applies disabled styling when button is disabled", async () => {
      const user = userEvent.setup();
      vi.mocked(signIn).mockImplementation(() => new Promise(() => {}));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(button).toHaveClass("disabled:opacity-50");
        expect(button).toHaveClass("disabled:cursor-not-allowed");
      });
    });

    it("re-enables button after signIn error", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      vi.mocked(signIn).mockRejectedValue(new Error("OAuth error"));

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button");
      await user.click(button);

      // Button should be re-enabled after error
      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Button rendering and accessibility", () => {
    it("renders with correct button type", () => {
      render(<OAuthButton provider="google" mode="signin" />);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
    });

    it("renders with correct text for signin mode", () => {
      render(<OAuthButton provider="google" mode="signin" />);
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    });

    it("renders with correct text for signup mode", () => {
      render(<OAuthButton provider="google" mode="signup" />);
      expect(screen.getByText(/sign up with google/i)).toBeInTheDocument();
    });

    it("renders with correct text for continue mode", () => {
      render(<OAuthButton provider="google" mode="continue" />);
      expect(screen.getByText(/continue with google/i)).toBeInTheDocument();
    });

    it("renders continue mode for all providers", () => {
      const providers: Array<"google" | "github" | "microsoft"> = ["google", "github", "microsoft"];
      for (const provider of providers) {
        const { unmount } = render(<OAuthButton provider={provider} mode="continue" />);
        expect(screen.getByRole("button").textContent).toContain("Continue");
        unmount();
      }
    });

    it("renders provider-specific styling for Google", () => {
      render(<OAuthButton provider="google" mode="signin" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-white");
      expect(button).toHaveClass("text-gray-700");
    });

    it("renders provider-specific styling for GitHub", () => {
      render(<OAuthButton provider="github" mode="signin" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-gray-900");
      expect(button).toHaveClass("text-white");
    });

    it("renders provider-specific styling for Microsoft", () => {
      render(<OAuthButton provider="microsoft" mode="signin" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-white");
      expect(button).toHaveClass("text-gray-700");
    });

    it("includes provider icon in button", () => {
      render(<OAuthButton provider="google" mode="signin" />);
      const button = screen.getByRole("button");
      const icon = button.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("logs error to console when signIn fails", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("OAuth provider error");
      
      vi.mocked(signIn).mockRejectedValue(error);

      render(<OAuthButton provider="google" mode="signin" />);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith("google sign-in error:", error);
      });

      consoleErrorSpy.mockRestore();
    });

    it("handles signIn rejection gracefully for all providers", async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const providers: Array<"google" | "github" | "microsoft"> = ["google", "github", "microsoft"];

      for (const provider of providers) {
        vi.clearAllMocks();
        vi.mocked(signIn).mockRejectedValue(new Error("OAuth error"));

        const { unmount } = render(<OAuthButton provider={provider} mode="signin" />);

        const button = screen.getByRole("button");
        await user.click(button);

        // Should not throw and should log error
        await waitFor(() => {
          expect(consoleErrorSpy).toHaveBeenCalled();
        });

        unmount();
      }

      consoleErrorSpy.mockRestore();
    });
  });
});
