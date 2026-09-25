#!/usr/bin/env node
// Imprime no log do job os diagnósticos do relatório JSON da action do
// React Doctor: o commit status mostra só score e contagens.
import { readFileSync } from 'node:fs';

for (const reportPath of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  console.log(`mode=${report.mode} ok=${report.ok}`, JSON.stringify(report.summary));
  if (report.error) console.log('error:', JSON.stringify(report.error));
  const diagnostics = (report.projects ?? []).flatMap((project) => project.diagnostics ?? []);
  for (const d of diagnostics.length > 0 ? diagnostics : report.diagnostics ?? []) {
    console.log(`${d.severity} ${d.plugin}/${d.rule} ${d.filePath}:${d.line} - ${d.message}`);
  }
}
