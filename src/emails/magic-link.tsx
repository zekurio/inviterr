import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

interface MagicLinkEmailProps {
  url: string;
  host?: string; // Optional: e.g., "yourdomain.com"
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ""; // Or your local dev URL

// Placeholder - Replace with the actual URL to your hosted logo icon
// e.g., from Vercel Blob or other public hosting
const logoIconUrl = `${baseUrl}/static/ticket-icon-placeholder.png`;

export const MagicLinkEmail = ({
  url,
  host = "Inviterr",
}: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Log in to {host}</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Recreated Logo Section */}
        <Section style={logoContainer}>
          <Row>
            {/* Icon Column */}
            <Column style={logoIconWrapper}>
              <Img
                src={logoIconUrl} // Use the hosted image URL
                width="32" // Set explicit width/height
                height="32"
                alt="Inviterr Logo Icon"
                style={logoIcon}
              />
            </Column>
            {/* Text Column */}
            <Column style={logoTextWrapper}>
              <Text style={logoText}>inviterr</Text>
            </Column>
          </Row>
        </Section>

        <Text style={paragraph}>Hello,</Text>
        <Text style={paragraph}>
          Click the button below to securely log in to your {host} account. This
          link will expire shortly.
        </Text>
        <Section style={btnContainer}>
          <Button style={button} href={url}>
            Log in to {host}
          </Button>
        </Section>
        <Text style={paragraph}>
          If you didn't request this email, you can safely ignore it.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          Powered by Inviterr - managing your Jellyfin invites.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;

// --- Styles --- (Inline CSS for Email Compatibility) ---

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  width: "580px",
  maxWidth: "100%",
};

// Logo Styles (Mimicking shadcn Logo)
const logoContainer = {
  margin: "0 auto",
  marginBottom: "32px",
  width: "auto", // Fit content
  display: "table", // Use table for alignment trick
};

const logoIconWrapper = {
  display: "table-cell",
  verticalAlign: "middle",
  // Mimic bg-primary - replace #yourPrimaryColor with your actual primary hex color
  backgroundColor: "#1a1a1a", // Example: Dark primary
  borderRadius: "6px",
  width: "32px",
  height: "32px",
  textAlign: "center" as const, // Center image horizontally if needed
};

const logoIcon = {
  // Image itself doesn't need much style if centered in wrapper
  display: "inline-block", // Prevents extra space below image
};

const logoTextWrapper = {
  display: "table-cell",
  verticalAlign: "middle",
  paddingLeft: "8px", // Mimic ml-2
};

const logoText = {
  // Mimic font-mono text-2xl
  fontFamily: "monospace",
  fontSize: "24px",
  lineHeight: "1.1", // Adjust line height to align well vertically
  margin: "0", // Reset default paragraph margins
  color: "#1a1a1a", // Match text color
};
// --- End Logo Styles ---

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
};

const btnContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  // Mimic shadcn button style
  backgroundColor: "#1a1a1a", // Example: Dark primary
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 20px",
  fontWeight: "500",
};

const hr = {
  borderColor: "#cccccc",
  margin: "20px 0",
};

const footer = {
  color: "#888888",
  fontSize: "12px",
};
