import * as React from "react";
import {
  Container,
  Heading,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";
import Layout from "./components/Layout";

interface ExportFailedProps {
  error: string;
  jobId: string;
  branding?: any;
}

export const ExportFailed = ({
  error,
  jobId,
  branding,
}: ExportFailedProps) => {
  return (
    <Layout preview="Your data export failed to process" branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-red-600 text-center mb-4">
          Export Failed
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          We encountered an error while processing your data export request.
        </Text>

        <Section className="bg-red-50 rounded-lg p-6 mb-8 border border-red-100">
          <Text className="text-red-800 font-medium mb-2">Error Details:</Text>
          <Text className="text-red-700 text-sm font-mono bg-white p-3 rounded border border-red-200">
            {error}
          </Text>
          <Text className="text-gray-500 text-xs mt-4">
            Job ID: {jobId}
          </Text>
        </Section>

        <Section className="text-center mb-8">
          <Button
            href="mailto:support@exportkit.io"
            className="bg-gray-900 text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block hover:bg-gray-800"
          >
            Contact Support
          </Button>
        </Section>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          Please try again later or contact support if the issue persists.
        </Text>
      </Container>
    </Layout>
  );
};

export default ExportFailed;
