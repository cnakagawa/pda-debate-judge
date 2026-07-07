import { chromium } from "playwright-core";
import type { PdfPort } from "../ports";
import { env } from "../lib/env";

export class PlaywrightPdfAdapter implements PdfPort {
  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const browser = await chromium.launch({
      executablePath: env().CHROMIUM_PATH,
      args: ["--no-sandbox", "--font-render-hinting=none"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
