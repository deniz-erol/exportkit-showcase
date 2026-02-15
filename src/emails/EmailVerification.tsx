import * as React from "react";
import {
  Button,
  Container,
  Heading,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import Layout from "./components/Layout.js";

interface EmailVerificationProps {
  verificationUrl: string;
  email: string;
  branding?: any;
}

export const EmailVerification = ({
  verificationUrl,
  email,
  branding,
}: EmailVerificationProps) => {
  const buttonColor = branding?.brandColor || "#2563eb";

  return (
    <Layout preview="Verify your email address to get started" branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          Verify Your Email
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          Welcome to ExportKit! Please verify your email address to complete your registration.
        </Text>

        <Section className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-100">
          <Text className="text-gray-500 m-0 uppercase text-xs font-semibold mb-2">Email Address</Text>
          <Text className="text-gray-900 m-0 font-medium">{email}</Text>
        </Section>

        <Section className="text-center mb-8">
          <Button
            href={verificationUrl}
            className="text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block"
            style={{ backgroundColor: buttonColor }}
          >
            Verify Email Address
          </Button>
        </Section>

        <Text className="text-xs text-gray-500 text-center mb-4">
          This verification link will expire in 24 hours.
        </Text>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          If you didn't create an account with ExportKit, you can safely ignore this email.
        </Text>
      </Container>
    </Layout>
  );
};

export default EmailVerification;
