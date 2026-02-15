import * as React from "react";
import {
  Button,
  Container,
  Heading,
  Text,
  Hr,
} from "@react-email/components";
import Layout from "./components/Layout.js";

interface TeamInvitationProps {
  inviteUrl: string;
  organizationName: string;
  role: string;
  branding?: any;
}

export const TeamInvitation = ({
  inviteUrl,
  organizationName,
  role,
  branding,
}: TeamInvitationProps) => {
  const buttonColor = branding?.brandColor || "#2563eb";

  return (
    <Layout preview={`You've been invited to join ${organizationName} on ExportKit`} branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          Team Invitation
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          You&apos;ve been invited to join <strong>{organizationName}</strong> on ExportKit
          as a <strong>{role.toLowerCase()}</strong>.
        </Text>

        <Button
          href={inviteUrl}
          className="text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block mx-auto"
          style={{ backgroundColor: buttonColor, display: "block", textAlign: "center" }}
        >
          Accept Invitation
        </Button>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          If you didn&apos;t expect this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Layout>
  );
};

export default TeamInvitation;
