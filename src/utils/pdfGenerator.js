import puppeteer from 'puppeteer';
import hbs from 'hbs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generatePdf = async (templateName, data, options = {}) => {
  let browser;
  try {
    const templatePath = path.join(__dirname, '../templates/pdf', `${templateName}.hbs`);
    const htmlContent = await fs.readFile(templatePath, 'utf-8');
    const template = hbs.compile(htmlContent);
    const finalHtml = template({ ...data });
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(finalHtml);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return pdfBuffer;
  } catch (error) {
    console.error('PDF Error:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};
