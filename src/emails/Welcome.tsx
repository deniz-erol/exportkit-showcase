import * as React from "react";
import {
  Button,
  Container,
  Heading,
  Section,
  Text,
  Hr,
  Link,
} from "@react-email/components";
import Layout from "./components/Layout.js";

interface WelcomeProps {
  dashboardUrl: string;
  docsUrl: string;
  branding?: any;
}

export const Welcome = ({
  dashboardUrl,
  docsUrl,
  branding,
}: WelcomeProps) => {
  const buttonColor = branding?.brandColor || "#2563eb";

  return (
    <Layout preview="Welcome to ExportKit — here's how to get started" branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          Welcome to ExportKit
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          Your email is verified and your account is ready. Here&apos;s everything you need to get started.
        </Text>

        <Section className="text-center mb-6">
          <Button
            href={dashboardUrl}
            className="text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block"
            style={{ backgroundColor: buttonColor }}
          >
            Open Dashboard
          </Button>
        </Section>

        <Hr className="border-gray-200 my-6" />

        <Heading as="h3" className="text-lg font-semibold text-gray-900 mb-3">
          Quick Start Guide
        </Heading>

        <Section className="mb-4">
          <Text className="text-gray-700 m-0 mb-2">
            <strong>1. Create an API key</strong> — Go to Settings → API Keys in your dashboard to generate your first key.
          </Text>
          <Text className="text-gray-700 m-0 mb-2">
            <strong>2. Trigger a test export</strong> — Use the API or React SDK to create your first CSV, JSON, or Excel export.
          </Text>
          <Text className="text-gray-700 m-0 mb-2">
            <strong>3. Set up webhooks</strong> — Configure a webhook endpoint to get notified when exports complete.
          </Text>
        </Section>

        <Hr className="border-gray-200 my-6" />

        <Section className="mb-4">
          <Text className="text-gray-700 m-0 mb-2">
            <Link href={docsUrl} className="text-blue-600 underline">API Documentation</Link>
            {" — "}Full reference for all endpoints, authentication, and SDKs.
          </Text>
          <Text className="text-gray-700 m-0 mb-2">
            <Link href={dashboardUrl} className="text-blue-600 underline">Dashboard</Link>
            {" — "}Manage exports, API keys, webhooks, and billing.
          </Text>
        </Section>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          Need help? Reply to this email or check our docs at{" "}
          <Link href={docsUrl} className="text-gray-400 underline">{docsUrl}</Link>.
        </Text>
      </Container>
    </Layout>
  );
};

export default Welcome;
