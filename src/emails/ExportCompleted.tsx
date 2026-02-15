import * as React from "react";
import {
  Button,
  Container,
  Heading,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import Layout from "./components/Layout";

interface ExportCompletedProps {
  downloadUrl: string;
  expiresAt: string;
  recordCount: number;
  fileSize: number;
  format: string;
  branding?: any;
}

export const ExportCompleted = ({
  downloadUrl,
  expiresAt,
  recordCount,
  fileSize,
  format,
  branding,
}: ExportCompletedProps) => {
  const expiryDate = new Date(expiresAt).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "short",
  });

  const formattedFileSize = (fileSize / 1024 / 1024).toFixed(2) + " MB";
  const buttonColor = branding?.brandColor || "#2563eb";

  return (
    <Layout preview="Your data export is ready for download" branding={branding}>
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          Export Ready
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          Your data export has been successfully generated and is ready for download.
        </Text>

        <Section className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="mb-2">
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Records</Text>
              <Text className="text-gray-900 m-0 font-medium">{recordCount.toLocaleString()}</Text>
            </div>
            <div className="mb-2">
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Size</Text>
              <Text className="text-gray-900 m-0 font-medium">{formattedFileSize}</Text>
            </div>
            <div>
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Format</Text>
              <Text className="text-gray-900 m-0 font-medium uppercase">{format}</Text>
            </div>
          </div>
        </Section>

        <Section className="text-center mb-8">
          <Button
            href={downloadUrl}
            className="text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block"
            style={{ backgroundColor: buttonColor }}
          >
            Download Export
          </Button>
        </Section>

        <Text className="text-xs text-gray-500 text-center mb-4">
          This link will expire on {expiryDate}.
        </Text>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          If you didn't request this export, you can safely ignore this email.
        </Text>
      </Container>
    </Layout>
  );
};

export default ExportCompleted;
