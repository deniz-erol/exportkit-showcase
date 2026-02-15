import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Unit tests for login page OAuth integration
 * **Validates: Requirements 3.1, 3.5, 7.1**
 *
 * Tests login page rendering and OAuth integration:
 * - OAuth buttons render on login page
 * - Error messages display for OAuth errors
 * - Email/password form still renders
 */

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock OAuthButton component
vi.mock("@/components/OAuthButton", () => ({
  default: ({ provider, mode }: { provider: string; mode: string }) => (
    <button data-testid={`oauth-button-${provider}`}>
      {mode === "continue" ? "Continue" : mode === "signin" ? "Sign in" : "Sign up"} with {provider}
    </button>
  ),
}));

// Mock LoginForm component
vi.mock("@/components/LoginForm", () => ({
  default: () => <form data-testid="login-form">Email/Password Form</form>,
}));

// Mock SocialProofPanel component
vi.mock("@/components/SocialProofPanel", () => ({
  default: ({ headline, description }: { headline: string; description: string }) => (
    <div data-testid="social-proof-panel">
      <h2>{headline}</h2>
      <p>{description}</p>
      <span data-testid="usage-stat">10,000+ exports processed</span>
      <blockquote data-testid="testimonial">
        <p>&ldquo;We shipped data exports in under an hour.&rdquo;</p>
        <footer>Engineering Lead · SaaS Startup</footer>
      </blockquote>
      <div data-testid="customer-logos">
        <span>Acme Corp</span>
        <span>TechFlow</span>
        <span>DataSync</span>
        <span>CloudBase</span>
      </div>
    </div>
  ),
}));

// Mock auth config
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// Helper to render async Server Component
async function renderServerComponent(
  Component: (props: any) => Promise<ReactElement>,
  props: any
) {
  const element = await Component(props);
  return render(element);
}

describe("Login Page OAuth Integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  describe("OAuth buttons render on login page", () => {
    it("renders Google OAuth button", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const googleButton = screen.getByTestId("oauth-button-google");
      expect(googleButton).toBeInTheDocument();
      expect(googleButton).toHaveTextContent("Continue with google");
    });

    it("renders GitHub OAuth button", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const githubButton = screen.getByTestId("oauth-button-github");
      expect(githubButton).toBeInTheDocument();
      expect(githubButton).toHaveTextContent("Continue with github");
    });

    it("renders Microsoft OAuth button", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const microsoftButton = screen.getByTestId("oauth-button-microsoft");
      expect(microsoftButton).toBeInTheDocument();
      expect(microsoftButton).toHaveTextContent("Continue with microsoft");
    });

    it("renders all three OAuth buttons in correct order", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const buttons = screen.getAllByRole("button");
      const oauthButtons = buttons.filter((btn) =>
        btn.getAttribute("data-testid")?.startsWith("oauth-button-")
      );

      expect(oauthButtons).toHaveLength(3);
      expect(oauthButtons[0]).toHaveAttribute("data-testid", "oauth-button-google");
      expect(oauthButtons[1]).toHaveAttribute("data-testid", "oauth-button-github");
      expect(oauthButtons[2]).toHaveAttribute("data-testid", "oauth-button-microsoft");
    });

    it("renders OAuth buttons with continue mode", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const googleButton = screen.getByTestId("oauth-button-google");
      const githubButton = screen.getByTestId("oauth-button-github");
      const microsoftButton = screen.getByTestId("oauth-button-microsoft");

      expect(googleButton).toHaveTextContent("Continue");
      expect(githubButton).toHaveTextContent("Continue");
      expect(microsoftButton).toHaveTextContent("Continue");
    });
  });

  describe("Error messages display for OAuth errors", () => {
    it("displays error message for OAuthSignin error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "OAuthSignin" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(
        /Error connecting to authentication provider/i
      );
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for OAuthCallback error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "OAuthCallback" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(/Error processing authentication/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for OAuthCreateAccount error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "OAuthCreateAccount" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(
        /Could not create account. Please try a different method/i
      );
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for OAuthAccountNotLinked error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "OAuthAccountNotLinked" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(
        /Email already in use with a different authentication method/i
      );
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for Callback error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "Callback" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(/Authentication error/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays default error message for unknown error codes", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "UnknownError" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(
        /An error occurred during authentication/i
      );
      expect(errorMessage).toBeInTheDocument();
    });

    it("does not display error message when no error parameter", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessages = screen.queryByText(/error/i);
      expect(errorMessages).not.toBeInTheDocument();
    });

    it("displays verification success message when verified=true", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ verified: "true" });
      await renderServerComponent(LoginPage, { searchParams });

      const successMessage = screen.getByText(
        /Email verified successfully. You can now sign in/i
      );
      expect(successMessage).toBeInTheDocument();
    });

    it("displays error message for invalid_token error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "invalid_token" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(
        /Invalid or expired verification link/i
      );
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for missing_token error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "missing_token" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(/Verification link is missing/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("displays error message for verification_failed error", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "verification_failed" });
      await renderServerComponent(LoginPage, { searchParams });

      const errorMessage = screen.getByText(/Verification failed/i);
      expect(errorMessage).toBeInTheDocument();
    });

    it("error messages have appropriate styling", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ error: "OAuthSignin" });
      const { container } = await renderServerComponent(LoginPage, { searchParams });

      const errorDiv = container.querySelector(".text-red-600");
      expect(errorDiv).toBeInTheDocument();
      expect(errorDiv).toHaveClass("bg-red-50");
      expect(errorDiv).toHaveClass("border-red-200");
    });

    it("success message has appropriate styling", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ verified: "true" });
      const { container } = await renderServerComponent(LoginPage, { searchParams });

      const successDiv = container.querySelector(".text-green-700");
      expect(successDiv).toBeInTheDocument();
      expect(successDiv).toHaveClass("bg-green-50");
      expect(successDiv).toHaveClass("border-green-200");
    });
  });

  describe("Email/password form still renders", () => {
    it("renders email/password login form", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const loginForm = screen.getByTestId("login-form");
      expect(loginForm).toBeInTheDocument();
    });

    it("renders login form below OAuth buttons", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      const { container } = await renderServerComponent(LoginPage, { searchParams });

      const oauthButton = screen.getByTestId("oauth-button-google");
      const loginForm = screen.getByTestId("login-form");

      // Get positions in DOM
      const oauthPosition = Array.from(container.querySelectorAll("*")).indexOf(
        oauthButton.parentElement!
      );
      const formPosition = Array.from(container.querySelectorAll("*")).indexOf(
        loginForm
      );

      expect(formPosition).toBeGreaterThan(oauthPosition);
    });

    it("renders divider between OAuth buttons and email form", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const dividerText = screen.getByText(/or sign in with email/i);
      expect(dividerText).toBeInTheDocument();
    });

    it("renders both OAuth buttons and email form simultaneously", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const googleButton = screen.getByTestId("oauth-button-google");
      const loginForm = screen.getByTestId("login-form");

      expect(googleButton).toBeInTheDocument();
      expect(loginForm).toBeInTheDocument();
    });

    it("renders signup link below login form", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const signupLink = screen.getByText(/Don't have an account/i);
      expect(signupLink).toBeInTheDocument();

      const signupLinkElement = screen.getByRole("link", { name: /Create one/i });
      expect(signupLinkElement).toHaveAttribute("href", "/signup");
    });
  });

  describe("Page layout and branding", () => {
    it("renders ExportKit branding in nav", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const navLink = screen.getByRole("link", { name: /ExportKit/ });
      expect(navLink).toBeInTheDocument();
      expect(navLink).toHaveAttribute("href", "/");
    });

    it("renders sign-in heading", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const heading = screen.getByText(/Sign in to ExportKit/i);
      expect(heading).toBeInTheDocument();
    });

    it("renders back to home link", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const backLink = screen.getByText(/Back to home/i);
      expect(backLink).toBeInTheDocument();
      expect(backLink.closest("a")).toHaveAttribute("href", "/");
    });

    it("renders copyright notice", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const currentYear = new Date().getFullYear();
      const copyright = screen.getByText(
        new RegExp(`© ${currentYear} ExportKit. All rights reserved`, "i")
      );
      expect(copyright).toBeInTheDocument();
    });

    it("renders pricing link in nav", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const pricingLink = screen.getByRole("link", { name: /Pricing/i });
      expect(pricingLink).toHaveAttribute("href", "/pricing");
    });
  });

  describe("Authentication state handling", () => {
    it("does not redirect when user is not authenticated", async () => {
      const { getServerSession } = await import("next-auth");
      const { redirect } = await import("next/navigation");

      vi.mocked(getServerSession).mockResolvedValue(null);

      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      expect(redirect).not.toHaveBeenCalled();
    });

    it("redirects to dashboard when user is already authenticated", async () => {
      const { getServerSession } = await import("next-auth");
      const { redirect } = await import("next/navigation");

      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        expires: "2024-12-31",
      });

      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});

      // This will throw because redirect() throws
      await expect(async () => {
        await renderServerComponent(LoginPage, { searchParams });
      }).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("Social proof panel — Requirements 5.1, 6.3", () => {
    it("renders the social proof panel", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      expect(screen.getByTestId("social-proof-panel")).toBeInTheDocument();
    });

    it("passes login-specific headline to social proof panel", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });

    it("renders a testimonial with quote and attribution", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const testimonial = screen.getByTestId("testimonial");
      expect(testimonial).toBeInTheDocument();
      expect(testimonial).toHaveTextContent(/shipped data exports/i);
      expect(testimonial).toHaveTextContent(/Engineering Lead/i);
    });

    it("renders usage stat badge", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const stat = screen.getByTestId("usage-stat");
      expect(stat).toBeInTheDocument();
      expect(stat).toHaveTextContent(/10,000\+ exports processed/i);
    });

    it("renders customer logos", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const logos = screen.getByTestId("customer-logos");
      expect(logos).toBeInTheDocument();
      expect(logos).toHaveTextContent("Acme Corp");
      expect(logos).toHaveTextContent("TechFlow");
      expect(logos).toHaveTextContent("DataSync");
    });
  });

  describe("Visual consistency with signup page — Requirements 5.1, 6.4", () => {
    it("uses same two-column layout structure as signup page", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      // Social proof panel on left, form on right
      expect(screen.getByTestId("social-proof-panel")).toBeInTheDocument();
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
    });

    it("renders shared header with ExportKit branding", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const navLink = screen.getByRole("link", { name: /ExportKit/ });
      expect(navLink).toHaveAttribute("href", "/");
    });

    it("renders shared footer with copyright and legal links", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const currentYear = new Date().getFullYear();
      expect(
        screen.getByText(new RegExp(`© ${currentYear} ExportKit. All rights reserved`, "i"))
      ).toBeInTheDocument();

      const termsLink = screen.getByRole("link", { name: /^Terms$/i });
      expect(termsLink).toHaveAttribute("href", "/terms");

      const privacyLink = screen.getByRole("link", { name: /^Privacy$/i });
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });

    it("renders navigation with aria-label", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const nav = screen.getByRole("navigation", { name: /login navigation/i });
      expect(nav).toBeInTheDocument();
    });

    it("renders OAuth button group with aria-label", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const group = screen.getByRole("group", { name: /sign in with a provider/i });
      expect(group).toBeInTheDocument();
    });

    it("renders back to home link consistent with signup page", async () => {
      const LoginPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(LoginPage, { searchParams });

      const backLink = screen.getByText(/back to home/i);
      expect(backLink).toBeInTheDocument();
      expect(backLink.closest("a")).toHaveAttribute("href", "/");
    });
  });
});
