import dns from 'dns';
import { config } from '../config/env';

const resolver = new dns.Resolver();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DNSRecord {
  type: string;
  value: string;
  expected?: string;
  status: 'CORRECT' | 'INCORRECT' | 'MISSING';
  priority?: number;
}

export interface DNSInstruction {
  record: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  currentValue?: string;
  expectedValue: string;
  description: string;
}

export interface DNSAnalysis {
  domain: string;
  records: {
    A: DNSRecord[];
    AAAA: DNSRecord[];
    MX: DNSRecord[];
    TXT: DNSRecord[];
    NS: DNSRecord[];
    CNAME: DNSRecord[];
  };
  spf: { found: boolean; value?: string; status: string };
  dkim: { found: boolean; value?: string; status: string };
  dmarc: { found: boolean; value?: string; status: string };
  instructions: DNSInstruction[];
  overallStatus: 'CORRECT' | 'PARTIAL' | 'INCORRECT';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(message: string): void {
  console.log(`[DNS ANALYZER] ${message}`);
}

function logError(message: string, err?: any): void {
  console.error(`[DNS ANALYZER ERROR] ${message}`, err || '');
}

function getSimulatedAnalysis(domain: string, expectedIP: string): DNSAnalysis {
  const platformDomain = config.platformDomain || 'jacvroyz.cl';
  const instructions: DNSInstruction[] = [
    {
      record: 'A',
      action: 'UPDATE',
      currentValue: '185.42.105.201',
      expectedValue: expectedIP,
      description: `Actualizar registro A de ${domain} para apuntar al nuevo servidor VPS`,
    },
    {
      record: 'A (www)',
      action: 'UPDATE',
      currentValue: '185.42.105.201',
      expectedValue: expectedIP,
      description: `Actualizar registro A de www.${domain} para apuntar al nuevo servidor VPS`,
    },
    {
      record: 'MX',
      action: 'CREATE',
      expectedValue: `mail.${platformDomain}`,
      description: `Crear registro MX apuntando a Mailcow para recibir correos`,
    },
    {
      record: 'TXT (SPF)',
      action: 'UPDATE',
      currentValue: 'v=spf1 +a +mx +ip4:185.42.105.201 ~all',
      expectedValue: `v=spf1 mx a ip4:${expectedIP} ~all`,
      description: `Actualizar registro SPF para autorizar el nuevo servidor a enviar correos`,
    },
    {
      record: 'TXT (DKIM)',
      action: 'CREATE',
      expectedValue: 'dkim._domainkey → (se generará al crear dominio en Mailcow)',
      description: `Crear registro DKIM después de configurar dominio en Mailcow`,
    },
    {
      record: 'TXT (DMARC)',
      action: 'CREATE',
      expectedValue: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      description: `Crear registro DMARC para protección contra spoofing de correo`,
    },
  ];

  return {
    domain,
    records: {
      A: [
        { type: 'A', value: '185.42.105.201', expected: expectedIP, status: 'INCORRECT' },
      ],
      AAAA: [],
      MX: [
        { type: 'MX', value: 'mail.cpanel-host.com', expected: `mail.${platformDomain}`, status: 'INCORRECT', priority: 10 },
      ],
      TXT: [
        { type: 'TXT', value: 'v=spf1 +a +mx +ip4:185.42.105.201 ~all', expected: `v=spf1 mx a ip4:${expectedIP} ~all`, status: 'INCORRECT' },
        { type: 'TXT', value: 'google-site-verification=abc123xyz', status: 'CORRECT' },
      ],
      NS: [
        { type: 'NS', value: 'ns1.registrar.cl', status: 'CORRECT' },
        { type: 'NS', value: 'ns2.registrar.cl', status: 'CORRECT' },
      ],
      CNAME: [],
    },
    spf: {
      found: true,
      value: 'v=spf1 +a +mx +ip4:185.42.105.201 ~all',
      status: 'Encontrado pero apunta al servidor anterior. Necesita actualización.',
    },
    dkim: {
      found: false,
      status: 'No encontrado. Se generará al configurar Mailcow.',
    },
    dmarc: {
      found: false,
      status: 'No encontrado. Se recomienda crear para protección anti-spoofing.',
    },
    instructions,
    overallStatus: 'PARTIAL',
  };
}

// ─── Safe DNS Query Helpers ──────────────────────────────────────────────────

async function resolveA(domain: string): Promise<string[]> {
  try {
    return await dns.promises.resolve4(domain);
  } catch {
    return [];
  }
}

async function resolveAAAA(domain: string): Promise<string[]> {
  try {
    return await dns.promises.resolve6(domain);
  } catch {
    return [];
  }
}

async function resolveMX(domain: string): Promise<dns.MxRecord[]> {
  try {
    return await dns.promises.resolveMx(domain);
  } catch {
    return [];
  }
}

async function resolveTXT(domain: string): Promise<string[][]> {
  try {
    return await dns.promises.resolveTxt(domain);
  } catch {
    return [];
  }
}

async function resolveNS(domain: string): Promise<string[]> {
  try {
    return await dns.promises.resolveNs(domain);
  } catch {
    return [];
  }
}

async function resolveCNAME(domain: string): Promise<string[]> {
  try {
    return await dns.promises.resolveCname(domain);
  } catch {
    return [];
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const dnsAnalyzerService = {
  async analyzeDomain(domain: string, expectedIP: string): Promise<DNSAnalysis> {
    log(`Analizando DNS para: ${domain} (IP esperada: ${expectedIP})`);

    if (isDryRun()) {
      log('[DRY RUN] Retornando análisis DNS simulado');
      return getSimulatedAnalysis(domain, expectedIP);
    }

    try {
      // Query all record types in parallel
      const [aRecords, aaaaRecords, mxRecords, txtRecords, nsRecords, cnameRecords] = await Promise.all([
        resolveA(domain),
        resolveAAAA(domain),
        resolveMX(domain),
        resolveTXT(domain),
        resolveNS(domain),
        resolveCNAME(domain),
      ]);

      // Build record analysis
      const records: DNSAnalysis['records'] = {
        A: aRecords.map(ip => ({
          type: 'A',
          value: ip,
          expected: expectedIP,
          status: ip === expectedIP ? 'CORRECT' as const : 'INCORRECT' as const,
        })),
        AAAA: aaaaRecords.map(ip => ({
          type: 'AAAA',
          value: ip,
          status: 'CORRECT' as const,
        })),
        MX: mxRecords.map(mx => ({
          type: 'MX',
          value: mx.exchange,
          expected: `mail.${config.platformDomain}`,
          status: (mx.exchange.includes(config.platformDomain.split('.')[0]) || mx.exchange.includes('neokikdigital')) ? 'CORRECT' as const : 'INCORRECT' as const,
          priority: mx.priority,
        })),
        TXT: txtRecords.map(txtArr => ({
          type: 'TXT',
          value: txtArr.join(''),
          status: 'CORRECT' as const,
        })),
        NS: nsRecords.map(ns => ({
          type: 'NS',
          value: ns,
          status: 'CORRECT' as const,
        })),
        CNAME: cnameRecords.map(cname => ({
          type: 'CNAME',
          value: cname,
          status: 'CORRECT' as const,
        })),
      };

      // If no A records exist, mark as MISSING
      if (records.A.length === 0) {
        records.A.push({ type: 'A', value: '', expected: expectedIP, status: 'MISSING' });
      }

      // Analyze SPF
      const txtValues = txtRecords.map(arr => arr.join(''));
      const spfRecord = txtValues.find(v => v.startsWith('v=spf1'));
      const spf = {
        found: !!spfRecord,
        value: spfRecord || undefined,
        status: spfRecord
          ? (spfRecord.includes(expectedIP) ? 'Correcto - incluye la IP del servidor' : 'Encontrado pero necesita actualización con la nueva IP')
          : 'No encontrado. Se debe crear un registro SPF.',
      };

      // Analyze DKIM
      let dkimValue: string | undefined;
      try {
        const dkimRecords = await resolveTXT(`dkim._domainkey.${domain}`);
        dkimValue = dkimRecords.map(arr => arr.join('')).find(v => v.includes('v=DKIM1'));
      } catch { /* ignore */ }

      const dkim = {
        found: !!dkimValue,
        value: dkimValue,
        status: dkimValue
          ? 'Encontrado. Verificar que corresponda al selector de Mailcow.'
          : 'No encontrado. Se generará al configurar Mailcow.',
      };

      // Analyze DMARC
      let dmarcValue: string | undefined;
      try {
        const dmarcRecords = await resolveTXT(`_dmarc.${domain}`);
        dmarcValue = dmarcRecords.map(arr => arr.join('')).find(v => v.includes('v=DMARC1'));
      } catch { /* ignore */ }

      const dmarc = {
        found: !!dmarcValue,
        value: dmarcValue,
        status: dmarcValue
          ? 'Encontrado. Política actual configurada.'
          : 'No encontrado. Se recomienda crear para protección anti-spoofing.',
      };

      // Generate instructions
      const instructions = this.generateInstructions(domain, expectedIP, records, spf, dkim, dmarc);

      // Determine overall status
      const aCorrect = records.A.some(r => r.status === 'CORRECT');
      const mxCorrect = records.MX.some(r => r.status === 'CORRECT') || records.MX.length === 0;
      const spfCorrect = spf.found && (spf.value?.includes(expectedIP) || false);

      let overallStatus: DNSAnalysis['overallStatus'];
      if (aCorrect && mxCorrect && spfCorrect && dkim.found && dmarc.found) {
        overallStatus = 'CORRECT';
      } else if (aCorrect || mxCorrect) {
        overallStatus = 'PARTIAL';
      } else {
        overallStatus = 'INCORRECT';
      }

      log(`Análisis DNS completado para ${domain}: ${overallStatus}`);

      return { domain, records, spf, dkim, dmarc, instructions, overallStatus };
    } catch (err) {
      logError(`Error analizando DNS de ${domain}`, err);

      // Return MISSING analysis on total failure
      return {
        domain,
        records: {
          A: [{ type: 'A', value: '', expected: expectedIP, status: 'MISSING' }],
          AAAA: [],
          MX: [{ type: 'MX', value: '', expected: `mail.${config.platformDomain}`, status: 'MISSING' }],
          TXT: [],
          NS: [],
          CNAME: [],
        },
        spf: { found: false, status: 'No se pudo consultar DNS del dominio.' },
        dkim: { found: false, status: 'No se pudo consultar DNS del dominio.' },
        dmarc: { found: false, status: 'No se pudo consultar DNS del dominio.' },
        instructions: [
          {
            record: 'A',
            action: 'CREATE',
            expectedValue: expectedIP,
            description: `Crear registro A para ${domain} apuntando al servidor VPS`,
          },
          {
            record: 'A (www)',
            action: 'CREATE',
            expectedValue: expectedIP,
            description: `Crear registro A para www.${domain} apuntando al servidor VPS`,
          },
        ],
        overallStatus: 'INCORRECT',
      };
    }
  },

  generateInstructions(
    domain: string,
    expectedIP: string,
    records: DNSAnalysis['records'],
    spf: DNSAnalysis['spf'],
    dkim: DNSAnalysis['dkim'],
    dmarc: DNSAnalysis['dmarc']
  ): DNSInstruction[] {
    const instructions: DNSInstruction[] = [];

    // A record instructions
    const aRecord = records.A[0];
    if (!aRecord || aRecord.status === 'MISSING') {
      instructions.push({
        record: 'A',
        action: 'CREATE',
        expectedValue: expectedIP,
        description: `Crear registro A para ${domain} apuntando a ${expectedIP}`,
      });
    } else if (aRecord.status === 'INCORRECT') {
      instructions.push({
        record: 'A',
        action: 'UPDATE',
        currentValue: aRecord.value,
        expectedValue: expectedIP,
        description: `Actualizar registro A de ${domain} de ${aRecord.value} a ${expectedIP}`,
      });
    }

    // www A/CNAME instructions
    instructions.push({
      record: 'A (www) o CNAME',
      action: records.CNAME.length > 0 ? 'UPDATE' : 'CREATE',
      currentValue: records.CNAME[0]?.value,
      expectedValue: expectedIP,
      description: `Configurar www.${domain} para apuntar a ${expectedIP} (registro A) o a ${domain} (CNAME)`,
    });

    // MX record instructions
    const mxCorrect = records.MX.some(r => r.status === 'CORRECT');
    if (!mxCorrect) {
      if (records.MX.length > 0) {
        instructions.push({
          record: 'MX',
          action: 'UPDATE',
          currentValue: records.MX.map(r => `${r.priority} ${r.value}`).join(', '),
          expectedValue: `10 mail.${config.platformDomain}`,
          description: `Actualizar registro MX de ${domain} para usar Mailcow`,
        });
      } else {
        instructions.push({
          record: 'MX',
          action: 'CREATE',
          expectedValue: `10 mail.${config.platformDomain}`,
          description: `Crear registro MX para ${domain} apuntando a Mailcow`,
        });
      }
    }

    // SPF instruction
    if (!spf.found) {
      instructions.push({
        record: 'TXT (SPF)',
        action: 'CREATE',
        expectedValue: `v=spf1 mx a ip4:${expectedIP} ~all`,
        description: `Crear registro SPF para autorizar el servidor a enviar correos`,
      });
    } else if (spf.value && !spf.value.includes(expectedIP)) {
      instructions.push({
        record: 'TXT (SPF)',
        action: 'UPDATE',
        currentValue: spf.value,
        expectedValue: `v=spf1 mx a ip4:${expectedIP} ~all`,
        description: `Actualizar registro SPF con la nueva IP del servidor`,
      });
    }

    // DKIM instruction
    if (!dkim.found) {
      instructions.push({
        record: 'TXT (DKIM)',
        action: 'CREATE',
        expectedValue: 'dkim._domainkey → (se generará al crear dominio en Mailcow)',
        description: `Crear registro DKIM después de configurar dominio en Mailcow`,
      });
    }

    // DMARC instruction
    if (!dmarc.found) {
      instructions.push({
        record: 'TXT (DMARC)',
        action: 'CREATE',
        expectedValue: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
        description: `Crear registro DMARC para protección contra spoofing`,
      });
    }

    return instructions;
  },
};
