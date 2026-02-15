import * as React from "react";
import {
  Container,
  Heading,
  Text,
  Hr,
} from "@react-email/components";
import Layout from "./components/Layout";

interface DeletionConfirmationProps {
  customerName: string;
  deletedAt: string;
  branding?: any;
}

export const DeletionConfirmation = ({
  customerName,
  deletedAt,
  branding,
}: DeletionConfirmationProps) => {
  const formattedDate = new Date(deletedAt).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "short",
  });

  return (
    <Layout preview="Your account has been deleted" branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          Account Deleted
        </Heading>
        <Text className="text-gray-700 mb-6">
          Hi {customerName},
        </Text>
        <Text className="text-gray-700 mb-6">
          Your ExportKit account and all associated data have been permanently deleted
          as requested. This action was completed on {formattedDate}.
        </Text>
        <Text className="text-gray-700 mb-6">
          The following data has been removed:
        </Text>
        <Text className="text-gray-700 mb-2">• Account information</Text>
        <Text className="text-gray-700 mb-2">• API keys</Text>
        <Text className="text-gray-700 mb-2">• Export jobs and files</Text>
        <Text className="text-gray-700 mb-2">• Usage records</Text>
        <Text className="text-gray-700 mb-6">• Audit logs</Text>

        <Text className="text-gray-700 mb-6">
          This action is irreversible. If you wish to use ExportKit again in the future,
          you will need to create a new account.
        </Text>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          This is a confirmation of your account deletion request per GDPR compliance.
        </Text>
      </Container>
    </Layout>
  );
};

export default DeletionConfirmation;
