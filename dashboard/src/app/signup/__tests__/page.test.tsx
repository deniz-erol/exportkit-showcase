import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Unit tests for signup page structure and accessibility.
 * **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.2, 4.3, 4.4, 8.2, 8.3, 8.4**
 *
 * Tests:
 * - OAuth buttons render in correct order (Google first)
 * - Implicit TOS text renders with correct links
 * - Social proof panel renders with testimonials, logos, stats
 * - Accessibility: aria-labels, accessible button names
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

// Mock SignupForm component
vi.mock("@/components/SignupForm", () => ({
  default: () => (
    <form data-testid="signup-form">
      <label htmlFor="email">Email address</label>
      <input id="email" type="email" />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" />
      <button type="submit">Create account</button>
    </form>
  ),
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

describe("Signup Page", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValue(null);
  });

  describe("OAuth buttons — Requirements 2.1, 2.2", () => {
    it("renders all three OAuth buttons", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByTestId("oauth-button-google")).toBeInTheDocument();
      expect(screen.getByTestId("oauth-button-github")).toBeInTheDocument();
      expect(screen.getByTestId("oauth-button-microsoft")).toBeInTheDocument();
    });

    it("renders Google button first, then GitHub, then Microsoft", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

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
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByTestId("oauth-button-google")).toHaveTextContent("Continue with google");
      expect(screen.getByTestId("oauth-button-github")).toHaveTextContent("Continue with github");
      expect(screen.getByTestId("oauth-button-microsoft")).toHaveTextContent("Continue with microsoft");
    });

    it("renders OAuth buttons above the email form", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      const { container } = await renderServerComponent(SignupPage, { searchParams });

      const googleButton = screen.getByTestId("oauth-button-google");
      const signupForm = screen.getByTestId("signup-form");

      const allElements = Array.from(container.querySelectorAll("*"));
      const oauthPosition = allElements.indexOf(googleButton);
      const formPosition = allElements.indexOf(signupForm);

      expect(formPosition).toBeGreaterThan(oauthPosition);
    });
  });

  describe("Implicit TOS text — Requirements 3.1, 3.2", () => {
    it("renders implicit TOS text", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const tosText = screen.getByText(/by creating an account, you agree to our/i);
      expect(tosText).toBeInTheDocument();
    });

    it("renders Terms of Service link pointing to /terms", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const tosLinks = screen.getAllByRole("link", { name: /terms of service/i });
      const inlineTosLink = tosLinks.find((link) => link.closest("p"));
      expect(inlineTosLink).toHaveAttribute("href", "/terms");
    });

    it("renders Privacy Policy link pointing to /privacy", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const privacyLinks = screen.getAllByRole("link", { name: /privacy policy/i });
      const inlinePrivacyLink = privacyLinks.find((link) => link.closest("p"));
      expect(inlinePrivacyLink).toHaveAttribute("href", "/privacy");
    });
  });

  describe("Social proof panel — Requirements 4.2, 4.3, 4.4", () => {
    it("renders the social proof panel", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByTestId("social-proof-panel")).toBeInTheDocument();
    });

    it("renders a testimonial with quote and attribution", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const testimonial = screen.getByTestId("testimonial");
      expect(testimonial).toBeInTheDocument();
      expect(testimonial).toHaveTextContent(/shipped data exports/i);
      expect(testimonial).toHaveTextContent(/Engineering Lead/i);
    });

    it("renders usage stat badge", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const stat = screen.getByTestId("usage-stat");
      expect(stat).toBeInTheDocument();
      expect(stat).toHaveTextContent(/10,000\+ exports processed/i);
    });

    it("renders customer logos", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const logos = screen.getByTestId("customer-logos");
      expect(logos).toBeInTheDocument();
      expect(logos).toHaveTextContent("Acme Corp");
      expect(logos).toHaveTextContent("TechFlow");
      expect(logos).toHaveTextContent("DataSync");
    });

    it("passes signup-specific headline to social proof panel", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByText(/ship exports in minutes/i)).toBeInTheDocument();
    });
  });

  describe("Accessibility — Requirements 8.2, 8.3, 8.4", () => {
    it("renders navigation with aria-label", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const nav = screen.getByRole("navigation", { name: /signup navigation/i });
      expect(nav).toBeInTheDocument();
    });

    it("renders OAuth button group with aria-label", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const group = screen.getByRole("group", { name: /sign up with a provider/i });
      expect(group).toBeInTheDocument();
    });

    it("OAuth buttons have accessible names including provider", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByTestId("oauth-button-google")).toHaveTextContent(/google/i);
      expect(screen.getByTestId("oauth-button-github")).toHaveTextContent(/github/i);
      expect(screen.getByTestId("oauth-button-microsoft")).toHaveTextContent(/microsoft/i);
    });

    it("form inputs have associated labels", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toBeInTheDocument();

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toBeInTheDocument();
    });
  });

  describe("Page layout and branding", () => {
    it("renders ExportKit branding in nav", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const navLink = screen.getByRole("link", { name: /ExportKit/ });
      expect(navLink).toHaveAttribute("href", "/");
    });

    it("renders create account heading", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByText(/create your account/i)).toBeInTheDocument();
    });

    it("renders back to home link", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const backLink = screen.getByText(/back to home/i);
      expect(backLink).toBeInTheDocument();
      expect(backLink.closest("a")).toHaveAttribute("href", "/");
    });

    it("renders divider between OAuth buttons and email form", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(screen.getByText(/or sign up with email/i)).toBeInTheDocument();
    });

    it("renders login link in nav", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const loginLink = screen.getByRole("link", { name: /log in/i });
      expect(loginLink).toHaveAttribute("href", "/login");
    });
  });

  describe("Authentication state handling", () => {
    it("does not redirect when user is not authenticated", async () => {
      const { getServerSession } = await import("next-auth");
      const { redirect } = await import("next/navigation");

      vi.mocked(getServerSession).mockResolvedValue(null);

      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      expect(redirect).not.toHaveBeenCalled();
    });

    it("redirects to dashboard when user is already authenticated", async () => {
      const { getServerSession } = await import("next-auth");
      const { redirect } = await import("next/navigation");

      vi.mocked(getServerSession).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
        expires: "2024-12-31",
      });

      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});

      await expect(async () => {
        await renderServerComponent(SignupPage, { searchParams });
      }).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("Plan query parameter handling", () => {
    it("passes plan to login link when plan param is present", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({ plan: "pro" });
      await renderServerComponent(SignupPage, { searchParams });

      const loginLink = screen.getByRole("link", { name: /log in/i });
      expect(loginLink).toHaveAttribute("href", "/login?plan=pro");
    });

    it("renders login link without plan param when no plan", async () => {
      const SignupPage = (await import("../page.js")).default;
      const searchParams = Promise.resolve({});
      await renderServerComponent(SignupPage, { searchParams });

      const loginLink = screen.getByRole("link", { name: /log in/i });
      expect(loginLink).toHaveAttribute("href", "/login");
    });
  });
});
