import fs from 'fs';
import { minify } from 'terser';

/**
 * Simple build script to minify widget files
 */

async function build() {
  console.log('Building widget files...');

  try {
    // Read widget JS
    const jsCode = fs.readFileSync('widget/split-pay-widget.js', 'utf8');
    
    // Minify JS
    const minifiedJs = await minify(jsCode, {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true,
      },
      mangle: {
        reserved: ['Stripe', 'CONFIG', 'state'] // Don't mangle these
      },
      format: {
        comments: false
      }
    });

    // Write minified JS
    fs.writeFileSync('widget/split-pay-widget.min.js', minifiedJs.code);
    console.log('✓ Created split-pay-widget.min.js');

    // Read and minify CSS (simple minification)
    const cssCode = fs.readFileSync('widget/split-pay-widget.css', 'utf8');
    const minifiedCss = cssCode
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/;\s*}/g, '}') // Remove semicolon before closing brace
      .replace(/\s*{\s*/g, '{') // Remove spaces around opening brace
      .replace(/;\s*/g, ';') // Remove spaces after semicolon
      .trim();

    fs.writeFileSync('widget/split-pay-widget.min.css', minifiedCss);
    console.log('✓ Created split-pay-widget.min.css');

    console.log('Build complete!');

  } catch (error) {
    console.error('Build error:', error);
    process.exit(1);
  }
}

build();

