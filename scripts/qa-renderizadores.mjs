import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// npm run test:renderizadores — Chromium do Playwright instalado previamente.
// Usa perfil descartável, Supabase desligado e somente rede localhost.
// QA_CICLOS permite rodar apenas os cenários funcionais depois do teste de estresse.
const output = '.qa-renderizadores';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' });
process.on('exit', () => server.kill());
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { server.kill(); reject(new Error('Vite não iniciou em 15s')); }, 15000);
  server.stdout.on('data', b => { if (b.toString().includes('5185')) { clearTimeout(timeout); resolve(); } });
  server.on('error', e => { clearTimeout(timeout); reject(e); });
  server.on('exit', code => { clearTimeout(timeout); reject(new Error(`vite exited ${code}`)); });
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const mensagens = [];
const erros = [];
page.on('pageerror', e => erros.push(String(e)));
page.setDefaultTimeout(15000);
page.on('console', m => { if (/context|webgl/i.test(m.text())) mensagens.push(m.text()); });
page.on('pageerror', e => mensagens.push(String(e)));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
    ? route.continue() : route.abort();
});
await page.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet();
  window.__gpu = { criados: 0, perdidos: 0, refs: [] };
  HTMLCanvasElement.prototype.getContext = function(...args) {
    const result = original.apply(this, args);
    if (result && /webgl/.test(args[0]) && !seen.has(result)) {
      seen.add(result);
      window.__gpu.criados++;
      window.__gpu.refs.push(new WeakRef(result));
      this.addEventListener('webglcontextlost', () => window.__gpu.perdidos++);
    }
    return result;
  };
});
const cdp = await page.context().newCDPSession(page);
async function snapshot(ciclo) {
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = await cdp.send('Memory.getDOMCounters');
  return { ciclo, ...metrics, ...await page.evaluate(() => ({
    criados: window.__gpu.criados, perdidos: window.__gpu.perdidos,
    contextosRetidos: window.__gpu.refs.filter(r => r.deref()).length,
    canvasNoDom: document.querySelectorAll('canvas').length,
    imagens: [...document.images].map(i => ({ completa: i.complete, largura: i.naturalWidth }))
  })) };
}
try {
  await page.goto('http://127.0.0.1:5185/');
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    const { useStore } = await import('/src/state/store.ts');
    const { criarFichaVazia, criarMapaBiblioteca } = await import('/src/state/factories.ts');
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 768;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#185a60'; ctx.fillRect(0, 0, 1024, 768);
    ctx.fillStyle = '#ea9747'; ctx.fillRect(100, 100, 300, 300);
    const foto = canvas.toDataURL();
    const ficha = { ...criarFichaVazia(), nome: 'Diagnóstico local', foto };
    const mapa = criarMapaBiblioteca('Mapa teste', '', foto, 0);
    useStore.setState({ fichas: [ficha], fichaAtivaId: ficha.id, mapa: { biblioteca: [mapa], mapaAtivoId: mapa.id, tokens: [] } });
  });
  await page.waitForTimeout(500);
  const tabs = page.getByRole('navigation', { name: 'Abas da mesa' });
  console.log(await tabs.innerText());
  const snapshots = [await snapshot(0)];
  await tabs.getByRole('button', { name: /Dados/ }).click();
  await expect(page.locator('#dice-bandeja canvas')).toHaveCount(1);
  await tabs.getByRole('button', { name: /Mapa/ }).click();
  await page.getByRole('button', { name: 'rolagem rápida d20', exact: true }).click();
  await expect(page.locator('#dice-overlay-rapido canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'rolar d20', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'fechar rolagem rápida', exact: true }).click();
  const base = await snapshot('bandejas inicializadas');
  snapshots.push(base);
  const ciclos = Number(process.env.QA_CICLOS ?? 100);
  for (let i = 1; i <= ciclos; i++) {
    await tabs.getByRole('button', { name: /Dados/ }).click();
    await expect(page.locator('#dice-bandeja canvas')).toBeVisible();
    await tabs.getByRole('button', { name: /Mapa/ }).click();
    await page.getByRole('button', { name: 'rolagem rápida d20', exact: true }).click();
    await expect(page.locator('#dice-overlay-rapido canvas')).toBeVisible();
    await page.getByRole('button', { name: 'fechar rolagem rápida', exact: true }).click();
    if (i % 25 === 0) {
      const estado = await snapshot(i); snapshots.push(estado);
      assert.equal(estado.criados, base.criados, 'trocar abas não pode criar outro contexto');
      assert.equal(estado.perdidos, base.perdidos, 'não pode perder contextos durante navegação');
      assert.equal(estado.contextosRetidos, base.contextosRetidos);
      console.log(`Navegação: ${i}/100 ciclos, ${estado.contextosRetidos} contextos estáveis`);
    }
  }
  await page.screenshot({ path: `${output}/mapa-100-ciclos.png` });
  // Rolagem forçada conhecida deve concluir uma única vez mesmo fechando o painel.
  await page.evaluate(async () => {
    const { enfileirarForcado } = await import('/src/dice/forcarRolagem.ts');
    enfileirarForcado([17], null, 'qualquer');
    const { useStore } = await import('/src/state/store.ts');
    window.__rollsAntes = useStore.getState().rollsLog.length;
  });
  await page.getByRole('button', { name: 'rolagem rápida d20', exact: true }).click();
  await page.getByRole('button', { name: 'rolar d20', exact: true }).click();
  await page.getByRole('button', { name: 'fechar rolagem rápida', exact: true }).click();
  await tabs.getByRole('button', { name: /Dados/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/state/store.ts');
    return useStore.getState().rollsLog.length - window.__rollsAntes;
  }), { timeout: 15000 }).toBe(1);
  const resultadoOculto = await page.evaluate(async () => {
    const { useStore } = await import('/src/state/store.ts');
    return useStore.getState().rollsLog[0].bruto;
  });
  assert.equal(resultadoOculto, 17);
  await tabs.getByRole('button', { name: /Mapa/ }).click();
  await page.getByRole('button', { name: 'rolagem rápida d20', exact: true }).click();
  await expect(page.locator('#dice-overlay-rapido canvas')).toBeVisible();
  await page.getByRole('button', { name: 'fechar rolagem rápida', exact: true }).click();
  console.log('Rolagem em painel fechado preservada: 17, uma única conclusão');
  // Perda de contexto real via extensão do WebGL: mapa deve remover somente o 3D.
  await page.locator('.mapa-area canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.locator('.mapa-area canvas')).toHaveCount(0);
  await expect(page.locator('.mapa-imagem')).toBeVisible();
  await page.screenshot({ path: `${output}/mapa-fallback.png` });
  await tabs.getByRole('button', { name: /Dados/ }).click();
  await page.locator('#dice-bandeja canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.locator('#dice-bandeja canvas')).toHaveCount(0);
  await expect(page.getByText(/renderização 3D indisponível nesta máquina/)).toBeVisible();
  await page.evaluate(async () => {
    const { enfileirarForcado } = await import('/src/dice/forcarRolagem.ts');
    enfileirarForcado([13], null, 'teste local');
  });
  await page.getByRole('button', { name: 'rolar 1d20', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useStore } = await import('/src/state/store.ts');
    return useStore.getState().rollsLog[0]?.bruto;
  })).toBe(13);
  console.log('Perda gráfica: mapa preservado e nova rolagem 2D concluída com 13');
  await page.screenshot({ path: `${output}/dados-fallback.png` });
  // Perda durante a física deve desbloquear o painel sem registrar um resultado inventado.
  await tabs.getByRole('button', { name: /Mapa/ }).click();
  await page.getByRole('button', { name: 'rolagem rápida d20', exact: true }).click();
  const antesDaInterrupcao = await page.evaluate(async () => (await import('/src/state/store.ts')).useStore.getState().rollsLog.length);
  await page.getByRole('button', { name: 'rolar d20', exact: true }).click();
  await page.locator('#dice-overlay-rapido canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.getByText('não consegui rolar — tente novamente.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'rolar d20', exact: true })).toBeEnabled();
  assert.equal(await page.evaluate(async () => (await import('/src/state/store.ts')).useStore.getState().rollsLog.length), antesDaInterrupcao);
  await page.getByRole('button', { name: 'rolar d20', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.ts')).useStore.getState().rollsLog.length)).toBe(antesDaInterrupcao + 1);
  console.log('Interrupção durante a física: sem resultado duplicado, nova rolagem 2D liberada');
  assert.equal(erros.length, 0, erros.join('\n'));
  assert.equal(mensagens.filter(m => m.includes('Too many active')).length, 0);
  snapshots.push(await snapshot('perdas induzidas: mapa, dados e rolagem rápida'));
  const resultado = { snapshots, mensagens };
  await writeFile(`${output}/resultado.json`, JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
} finally { await browser.close(); server.kill(); }
