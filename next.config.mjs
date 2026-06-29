import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  // Path to the request configuration file (next-intl v4 convention)
  "./src/i18n/request.ts"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14 uses experimental.serverComponentsExternalPackages
  // (renamed to serverExternalPackages in Next.js 15)
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "pdfjs-dist",
      "officeparser",
      "mammoth",
      "pino",
      "pino-pretty",
      "@aws-sdk/client-bedrock-runtime",
      "@aws-sdk/client-bedrock",
      "@aws-sdk/client-sts",
      "@smithy/node-http-handler",
    ],
    // pdf-parse/lib/pdf-parse.js loads pdfjs via a template-literal require:
    //   require(`./pdf.js/${version}/build/pdf.js`)
    // @vercel/nft cannot statically trace template literals, so Vercel omits
    // the pdfjs bundle from the deployment.  Explicitly include the whole
    // lib/ tree so the require succeeds at runtime.
    outputFileTracingIncludes: {
      "/api/trpc/[trpc]": ["./node_modules/pdf-parse/lib/**"],
    },
  },
};

export default withNextIntl(nextConfig);
