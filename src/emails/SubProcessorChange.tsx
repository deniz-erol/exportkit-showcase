import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { BrandingConfig } from "./components/Layout.js";
import { Layout } from "./components/Layout.js";

interface SubProcessorChangeEmailProps {
  customerName: string;
  changeDescription: string;
  effectiveDate: string;
  branding?: BrandingConfig;
}

/**
 * Email template for sub-processor change notifications (LEGAL-07)
 * Sent to customers who have opted in to sub-processor change notifications.
 */
export function SubProcessorChangeEmail({
  customerName,
  changeDescription,
  effectiveDate,
  branding,
}: SubProcessorChangeEmailProps) {
  const previewText = "Important: Sub-Processor Change Notification";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Layout branding={branding}>
          <Container style={container}>
            <Heading style={h1}>Sub-Processor Change Notification</Heading>

            <Text style={text}>Hi {customerName},</Text>

            <Text style={text}>
              We are writing to inform you of an upcoming change to our list of
              sub-processors (third-party service providers that process
              customer data on behalf of ExportKit).
            </Text>

            <Section style={changeBox}>
              <Text style={changeText}>{changeDescription}</Text>
            </Section>

            <Text style={text}>
              <strong>Effective Date:</strong> {effectiveDate}
            </Text>

            <Text style={text}>
              You can view the complete and current list of our sub-processors
              at any time:
            </Text>

            <Section style={buttonContainer}>
              <Link
                href={`${process.env.API_BASE_URL}/sub-processors`}
                style={button}
              >
                View Sub-Processors List
              </Link>
            </Section>

            <Text style={text}>
              If you have any questions or concerns about this change, please
              contact us at{" "}
              <Link href="mailto:privacy@exportkit.com" style={link}>
                privacy@exportkit.com
              </Link>
              .
            </Text>

            <Text style={text}>
              You are receiving this notification because you have opted in to
              sub-processor change notifications in your account settings. You
              can manage your notification preferences in your{" "}
              <Link
                href={`${process.env.API_BASE_URL}/dashboard/settings/account`}
                style={link}
              >
                Dashboard settings
              </Link>
              .
            </Text>

            <Text style={footer}>
              Best regards,
              <br />
              The ExportKit Team
            </Text>
          </Container>
        </Layout>
      </Body>
    </Html>
  );
}

export default SubProcessorChangeEmail;

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0",
  textAlign: "center" as const,
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "16px 0",
};

const changeBox = {
  backgroundColor: "#f8f9fa",
  border: "1px solid #e1e4e8",
  borderRadius: "6px",
  padding: "16px",
  margin: "24px 0",
};

const changeText = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0",
  fontWeight: "500" as const,
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#0070f3",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const link = {
  color: "#0070f3",
  textDecoration: "underline",
};

const footer = {
  color: "#666",
  fontSize: "14px",
  lineHeight: "24px",
  marginTop: "32px",
};
