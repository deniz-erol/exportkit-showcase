import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
  Link,
  Preview,
  Tailwind,
} from "@react-email/components";

interface Branding {
  logoUrl?: string;
  brandColor?: string;
  companyName?: string;
  footerText?: string;
  companyUrl?: string;
}

interface LayoutProps {
  children: React.ReactNode;
  preview?: string;
  branding?: Branding;
}

export const Layout = ({
  children,
  preview,
  branding = {
    companyName: "ExportKit",
    brandColor: "#000000",
  },
}: LayoutProps) => {
  const {
    logoUrl,
    brandColor = "#000000",
    companyName = "ExportKit",
    footerText,
    companyUrl,
  } = branding;

  return (
    <Html>
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Tailwind>
        <Body className="bg-white font-sans text-gray-900">
          <Container className="mx-auto py-5 px-4 max-w-[580px]">
            {/* Header */}
            <Section className="mt-8 mb-8">
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  width="auto"
                  height="40"
                  alt={companyName}
                  className="mx-auto"
                />
              ) : (
                <Text
                  className="text-2xl font-bold text-center m-0"
                  style={{ color: brandColor }}
                >
                  {companyName}
                </Text>
              )}
            </Section>

            {/* Content */}
            <Section className="bg-white">
              {children}
            </Section>

            {/* Footer */}
            <Section className="mt-8 pt-8 border-t border-gray-200">
              {footerText && (
                <Text className="text-xs text-gray-500 text-center mb-4">
                  {footerText}
                </Text>
              )}
              <Text className="text-xs text-gray-500 text-center mb-4">
                © {new Date().getFullYear()} {companyName}. All rights reserved.
              </Text>
              {companyUrl && (
                <Text className="text-xs text-center">
                  <Link
                    href={companyUrl}
                    className="text-gray-500 underline"
                  >
                    Visit our website
                  </Link>
                </Text>
              )}
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default Layout;
