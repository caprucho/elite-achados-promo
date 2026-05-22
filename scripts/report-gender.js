// Relatório de classificação de gênero — roda inferGender em todos os
// produtos ativos e mostra estatísticas. Use ANTES de aplicar no banco
// pra revisar se a heurística tá razoável.
//
// Uso: node scripts/report-gender.js
//      node scripts/report-gender.js --apply   ← grava is_masc/is_fem no banco
require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const { inferGender } = require('../src/utils/inferGender');

const APPLY = process.argv.includes('--apply');

async function main() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, store, category')
    .eq('active', true);
  if (error) { console.error(error); process.exit(1); }

  const stats = {
    total: products.length,
    masc: 0, fem: 0, unisex: 0, none: 0, ambiguous: 0,
  };
  const ambiguousList = [];
  const sample = { masc: [], fem: [], unisex: [], none: [] };

  for (const p of products) {
    const g = inferGender(p.name, p.store, p.category);
    p._gender = g;
    if (g.ambiguous) {
      stats.ambiguous++;
      ambiguousList.push(p);
    } else if (g.masc && g.fem) {
      stats.unisex++;
      if (sample.unisex.length < 3) sample.unisex.push(p);
    } else if (g.masc) {
      stats.masc++;
      if (sample.masc.length < 3) sample.masc.push(p);
    } else if (g.fem) {
      stats.fem++;
      if (sample.fem.length < 3) sample.fem.push(p);
    } else {
      stats.none++;
      if (sample.none.length < 3) sample.none.push(p);
    }
  }

  console.log('━━━ RELATÓRIO DE INFERÊNCIA DE GÊNERO ━━━\n');
  console.log(`Total ativos:   ${stats.total}`);
  console.log(`  ✅ MASC:      ${stats.masc}`);
  console.log(`  ✅ FEM:       ${stats.fem}`);
  console.log(`  ✅ UNISEX:    ${stats.unisex}`);
  console.log(`  ⚪ SEM-GENERO:${stats.none}  (hardware/eletronicos/casa)`);
  console.log(`  ⚠️  AMBIGUOS: ${stats.ambiguous}  (vão pro Geral com [?])`);
  console.log('');

  console.log('━━━ AMOSTRAS ━━━');
  for (const [k, arr] of Object.entries(sample)) {
    if (!arr.length) continue;
    console.log(`\n  [${k.toUpperCase()}]`);
    for (const p of arr) console.log(`    - (${p.store}/${p.category}) ${p.name}  ← ${p._gender.reason}`);
  }

  if (ambiguousList.length) {
    console.log('\n━━━ TODOS OS AMBÍGUOS (revise) ━━━');
    for (const p of ambiguousList) {
      console.log(`  ${p.id.slice(0,8)}  (${p.store}/${p.category}) ${p.name}`);
    }
  }

  if (APPLY) {
    console.log('\n━━━ APLICANDO NO BANCO (--apply) ━━━');
    let updated = 0, failed = 0;
    for (const p of products) {
      if (p._gender.ambiguous) continue; // ambíguos ficam com is_masc=false, is_fem=false (default)
      const { error } = await supabase
        .from('products')
        .update({ is_masc: p._gender.masc, is_fem: p._gender.fem })
        .eq('id', p.id);
      if (error) { failed++; console.warn('  fail', p.id, error.message); }
      else updated++;
    }
    console.log(`  ${updated} atualizados, ${failed} falharam.`);
    console.log(`  ${ambiguousList.length} ambíguos ficaram com is_masc=false, is_fem=false (default).`);
  } else {
    console.log('\n💡 Rode com --apply pra gravar no banco.');
  }

  process.exit(0);
}

main();
