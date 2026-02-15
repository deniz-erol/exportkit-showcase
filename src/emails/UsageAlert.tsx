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

interface UsageAlertProps {
  threshold: number;
  totalRows: number;
  limit: number;
  percentUsed: number;
  planName: string;
  billingPeriod: string;
  branding?: any;
}

export const UsageAlert = ({
  threshold,
  totalRows,
  limit,
  percentUsed,
  planName,
  billingPeriod,
  branding,
}: UsageAlertProps) => {
  const isAtLimit = threshold >= 100;
  const buttonColor = branding?.brandColor || "#2563eb";

  return (
    <Layout
      preview={`You've reached ${threshold}% of your ${planName} plan usage`}
      branding={branding}
    >
      <Container>
        <Heading className="text-2xl font-bold text-gray-900 text-center mb-4">
          {isAtLimit ? "Usage Limit Reached" : "Usage Alert"}
        </Heading>
        <Text className="text-gray-700 mb-6 text-center">
          {isAtLimit
            ? `You've reached 100% of your monthly export limit on the ${planName} plan.`
            : `You've used ${percentUsed}% of your monthly export limit on the ${planName} plan.`}
        </Text>

        <Section className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-100">
          <div className="text-sm">
            <div className="mb-2">
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Rows Used</Text>
              <Text className="text-gray-900 m-0 font-medium">
                {totalRows.toLocaleString()} / {limit.toLocaleString()}
              </Text>
            </div>
            <div className="mb-2">
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Billing Period</Text>
              <Text className="text-gray-900 m-0 font-medium">{billingPeriod}</Text>
            </div>
            <div>
              <Text className="text-gray-500 m-0 uppercase text-xs font-semibold">Current Plan</Text>
              <Text className="text-gray-900 m-0 font-medium">{planName}</Text>
            </div>
          </div>
        </Section>

        {isAtLimit ? (
          <Text className="text-gray-700 mb-6 text-center">
            Upgrade your plan to continue exporting data without interruption.
          </Text>
        ) : (
          <Text className="text-gray-700 mb-6 text-center">
            Consider upgrading your plan to avoid hitting your limit.
          </Text>
        )}

        <Section className="text-center mb-8">
          <Button
            href={`${process.env.DASHBOARD_URL || "http://localhost:3001"}/settings/billing`}
            className="text-white font-bold px-6 py-3 rounded-md text-center no-underline inline-block"
            style={{ backgroundColor: buttonColor }}
          >
            {isAtLimit ? "Upgrade Plan" : "View Usage"}
          </Button>
        </Section>

        <Hr className="border-gray-200 my-6" />

        <Text className="text-xs text-gray-400 text-center">
          This is an automated usage notification for your ExportKit account.
        </Text>
      </Container>
    </Layout>
  );
};

export default UsageAlert;
