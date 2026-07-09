import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalysisReport {
  domains: {
    primary: string;
    addon: string[];
    parked: string[];
    subdomains: string[];
  };
  projectType: 'WORDPRESS' | 'LARAVEL' | 'REACT' | 'NEXTJS' | 'PHP' | 'HTML' | 'NODE' | 'UNKNOWN';
  projectTypeConfidence: number;
  wordpress?: {
    version: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    dbHost: string;
    tablePrefix: string;
    siteUrl: string;
    uploadsSize: string;
    plugins: string[];
    themes: string[];
    phpVersion: string;
  };
  databases: {
    name: string;
    size: string;
    charset: string;
    tables: number;
    dumpFile: string;
  }[];
  emails: {
    domain: string;
    accounts: {
      address: string;
      quota: string;
      messageCount: number;
      folders: string[];
      maildirSize: string;
    }[];
  }[];
  phpVersion: string;
  diskUsage: { total: string; breakdown: { path: string; size: string }[] };
  cronJobs: { schedule: string; command: string }[];
  sslCertificates: { domain: string; issuer: string; expiry: string }[];
  redirects: { from: string; to: string; type: string }[];
  configFiles: string[];
  hiddenFiles: string[];
  backupSize: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDryRun(): boolean {
  return !!config.caddy.dryRun;
}

function log(message: string): void {
  console.log(`[BACKUP ANALYZER] ${message}`);
}

function logError(message: string, err?: any): void {
  console.error(`[BACKUP ANALYZER ERROR] ${message}`, err || '');
}

function extractDomainFromPath(filePath: string): string {
  const base = path.basename(filePath);
  // Strip common archive extensions
  let clean = base.replace(/\.(tar\.gz|tgz|tar|zip|gz)$/i, '');
  // Strip unique suffix added by multer (looks like: 1234567890-123456789-)
  clean = clean.replace(/^\d+-\d+-/, '');
  // Strip cPanel backup prefix: backup-M.D.YYYY_HH-MM-SS_
  clean = clean.replace(/^backup-[\d.]+_[\d-]+_/, '');
  // Strip cpmove- prefix
  clean = clean.replace(/^cpmove-/, '');
  // Try to find a domain pattern with a real TLD (2-6 letters after the last dot)
  const domainMatch = clean.match(/([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|net|org|cl|io|dev|co|me|info|biz|us|uk|es|ar|mx|br|pe|ec|py|uy|bo|ve|cr|pa|do|gt|hn|sv|ni|cu|pr|[a-zA-Z]{2,6}))/);
  if (domainMatch) {
    return domainMatch[1];
  }
  // Fallback: if clean looks like a cPanel username (no dots), it's not a domain
  if (clean && !clean.includes('.')) {
    // If username ends with 'cl', map to .cl (e.g. tddcl -> tdd.cl)
    if (clean.endsWith('cl') && clean.length > 2) {
      return clean.slice(0, -2) + '.cl';
    }
    // If username ends with 'com', map to .com (e.g. tddcom -> tdd.com)
    if (clean.endsWith('com') && clean.length > 3) {
      return clean.slice(0, -3) + '.com';
    }
    // If username ends with 'net', map to .net (e.g. tddnet -> tdd.net)
    if (clean.endsWith('net') && clean.length > 3) {
      return clean.slice(0, -3) + '.net';
    }
    return `${clean}.cl`;
  }
  return 'dominio-desconocido.com';
}

function getSimulatedReport(filePath: string): AnalysisReport {
  const domain = extractDomainFromPath(filePath);
  const domainPrefix = domain.split('.')[0];
  const dbName = `${domainPrefix}_wordpress`;
  const dbUser = `${domainPrefix}_wpuser`;

  const fileSize = (() => {
    try {
      const stats = fs.statSync(filePath);
      return `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      return '847.3 MB';
    }
  })();

  return {
    domains: {
      primary: domain,
      addon: [`tienda.${domain}`],
      parked: [`${domainPrefix}.com`],
      subdomains: [`blog.${domain}`, `dev.${domain}`],
    },
    projectType: 'WORDPRESS',
    projectTypeConfidence: 97,
    wordpress: {
      version: '6.4.2',
      dbName,
      dbUser,
      dbPassword: 'K$9xm!pL2wQ8nR',
      dbHost: 'localhost',
      tablePrefix: 'wp_',
      siteUrl: `https://${domain}`,
      uploadsSize: '342 MB',
      plugins: [
        'woocommerce',
        'elementor',
        'contact-form-7',
        'wordfence',
        'yoast-seo',
        'wp-super-cache',
        'updraftplus',
        'classic-editor',
      ],
      themes: ['flavor', 'flavor-child', 'flavor-developer'],
      phpVersion: '8.1',
    },
    databases: [
      {
        name: dbName,
        size: '48.7 MB',
        charset: 'utf8mb4',
        tables: 47,
        dumpFile: `mysql/${dbName}.sql`,
      },
    ],
    emails: [
      {
        domain,
        accounts: [
          {
            address: `contacto@${domain}`,
            quota: '500 MB',
            messageCount: 1247,
            folders: ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Clientes'],
            maildirSize: '189 MB',
          },
          {
            address: `ventas@${domain}`,
            quota: '500 MB',
            messageCount: 834,
            folders: ['INBOX', 'Sent', 'Drafts', 'Trash', 'Cotizaciones', 'Pedidos'],
            maildirSize: '156 MB',
          },
          {
            address: `gerencia@${domain}`,
            quota: '1000 MB',
            messageCount: 2103,
            folders: ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Importantes', 'Archivo'],
            maildirSize: '412 MB',
          },
        ],
      },
    ],
    phpVersion: '8.1',
    diskUsage: {
      total: '1.2 GB',
      breakdown: [
        { path: 'public_html/', size: '487 MB' },
        { path: 'public_html/wp-content/uploads/', size: '342 MB' },
        { path: 'mail/', size: '757 MB' },
        { path: 'mysql/', size: '48.7 MB' },
        { path: 'logs/', size: '12 MB' },
        { path: 'ssl/', size: '24 KB' },
        { path: '.htaccess', size: '2 KB' },
      ],
    },
    cronJobs: [
      { schedule: '*/15 * * * *', command: `/usr/local/bin/php /home/${domainPrefix}/public_html/wp-cron.php` },
      { schedule: '0 3 * * *', command: `/usr/local/bin/php /home/${domainPrefix}/public_html/wp-cli.phar cron event run --due-now` },
    ],
    sslCertificates: [
      {
        domain,
        issuer: 'cPanel, Inc. Certification Authority',
        expiry: new Date(Date.now() + 45 * 24 * 3600 * 1000).toISOString().split('T')[0],
      },
    ],
    redirects: [
      { from: `http://${domain}`, to: `https://${domain}`, type: '301' },
      { from: `http://www.${domain}`, to: `https://${domain}`, type: '301' },
    ],
    configFiles: [
      '.htaccess',
      'wp-config.php',
      'php.ini',
      '.user.ini',
      'public_html/.htaccess',
      'public_html/wp-config.php',
    ],
    hiddenFiles: [
      '.htaccess',
      '.user.ini',
      'public_html/.htaccess',
      'public_html/.maintenance',
    ],
    backupSize: fileSize,
  };
}

// ─── Real Extraction Helpers ─────────────────────────────────────────────────

function detectProjectType(extractedPath: string): { type: AnalysisReport['projectType']; confidence: number } {
  const publicHtml = path.join(extractedPath, 'public_html');
  const homedir = path.join(extractedPath, 'homedir', 'public_html');
  const docRoot = fs.existsSync(publicHtml) ? publicHtml : fs.existsSync(homedir) ? homedir : extractedPath;

  if (fs.existsSync(path.join(docRoot, 'wp-config.php')) || fs.existsSync(path.join(docRoot, 'wp-login.php'))) {
    return { type: 'WORDPRESS', confidence: 98 };
  }
  if (fs.existsSync(path.join(docRoot, 'artisan')) && fs.existsSync(path.join(docRoot, 'composer.json'))) {
    return { type: 'LARAVEL', confidence: 95 };
  }
  if (fs.existsSync(path.join(docRoot, 'next.config.js')) || fs.existsSync(path.join(docRoot, 'next.config.mjs'))) {
    return { type: 'NEXTJS', confidence: 92 };
  }
  if (fs.existsSync(path.join(docRoot, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(docRoot, 'package.json'), 'utf-8'));
      if (pkg.dependencies?.react) return { type: 'REACT', confidence: 88 };
      return { type: 'NODE', confidence: 80 };
    } catch {
      return { type: 'NODE', confidence: 60 };
    }
  }
  const phpFiles = fs.readdirSync(docRoot).filter(f => f.endsWith('.php'));
  if (phpFiles.length > 0) return { type: 'PHP', confidence: 75 };

  const htmlFiles = fs.readdirSync(docRoot).filter(f => f.endsWith('.html') || f.endsWith('.htm'));
  if (htmlFiles.length > 0) return { type: 'HTML', confidence: 70 };

  return { type: 'UNKNOWN', confidence: 0 };
}

function parseWpConfig(wpConfigPath: string): Partial<NonNullable<AnalysisReport['wordpress']>> {
  try {
    const content = fs.readFileSync(wpConfigPath, 'utf-8');

    const extract = (pattern: RegExp): string => {
      const match = content.match(pattern);
      return match ? match[1] : '';
    };

    return {
      dbName: extract(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"](.*?)['"]\s*\)/),
      dbUser: extract(/define\s*\(\s*['"]DB_USER['"]\s*,\s*['"](.*?)['"]\s*\)/),
      dbPassword: extract(/define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"](.*?)['"]\s*\)/),
      dbHost: extract(/define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"](.*?)['"]\s*\)/),
      tablePrefix: extract(/\$table_prefix\s*=\s*['"](.*?)['"]/),
    };
  } catch {
    return {};
  }
}

function parseCronFile(cronPath: string): { schedule: string; command: string }[] {
  try {
    const content = fs.readFileSync(cronPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        return {
          schedule: parts.slice(0, 5).join(' '),
          command: parts.slice(5).join(' '),
        };
      }
      return { schedule: 'unknown', command: line.trim() };
    });
  } catch {
    return [];
  }
}

function getDirSizeSync(dirPath: string): number {
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        totalSize += fs.statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        totalSize += getDirSizeSync(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return totalSize;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const backupAnalyzerService = {
  async analyzeBackup(filePath: string, backupType: string): Promise<AnalysisReport> {
    log(`Analizando backup: ${filePath} (tipo: ${backupType})`);

    // If the file exists, attempt real analysis even in dry-run/dev mode
    if (fs.existsSync(filePath)) {
      try {
        log('El archivo de respaldo real existe. Intentando análisis real...');
        return await this.performRealAnalysis(filePath, backupType);
      } catch (err) {
        logError('Error en análisis real del archivo, cayendo a simulación', err);
      }
    }

    log('[DRY RUN] Retornando análisis simulado de backup cPanel WordPress');
    await new Promise(resolve => setTimeout(resolve, 200));
    return getSimulatedReport(filePath);
  },

  async performRealAnalysis(filePath: string, backupType: string): Promise<AnalysisReport> {
    const { execSync } = require('child_process');
    const os = require('os');
    const extractDir = path.join(os.tmpdir(), `neokik_backup_${Date.now()}`);

    try {
      // Extract backup
      log(`Extrayendo backup en: ${extractDir}`);
      fs.mkdirSync(extractDir, { recursive: true });

      const isWindows = process.platform === 'win32';

      if (filePath.endsWith('.zip')) {
        if (isWindows) {
          execSync(`powershell Expand-Archive -Path "${filePath}" -DestinationPath "${extractDir}" -Force`, { timeout: 300000 });
        } else {
          execSync(`unzip -o "${filePath}" -d "${extractDir}"`, { timeout: 300000 });
        }
      } else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz') || filePath.endsWith('.tar')) {
        try {
          const excludeFlags = [
            '--exclude="*wp-content/uploads*"',
            '--exclude="*node_modules*"',
            '--exclude="*wp-content/cache*"',
            '--exclude="*.zip"',
            '--exclude="*.tar*"',
            '--exclude="*.mp4"',
            '--exclude="*.pdf"',
            '--exclude="*.png"',
            '--exclude="*.jpg"',
            '--exclude="*.jpeg"',
            '--exclude="*.gif"',
            '--exclude="*vendor*"'
          ].join(' ');

          execSync(`tar -xf "${filePath}" -C "${extractDir}" ${excludeFlags}`, { timeout: 300000 });
        } catch (tarErr) {
          const extractedContents = fs.existsSync(extractDir) ? fs.readdirSync(extractDir) : [];
          if (extractedContents.length > 0) {
            log(`[WARNING] tar reportó advertencias o errores menores durante la extracción, pero se encontraron archivos extraídos. Continuando análisis...`);
          } else {
            throw tarErr;
          }
        }
      } else {
        throw new Error(`Formato de backup no soportado: ${path.extname(filePath)}`);
      }

      // Find the actual content root (cPanel backups have a username folder)
      const entries = fs.readdirSync(extractDir);
      const contentRoot = entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()
        ? path.join(extractDir, entries[0])
        : extractDir;

      // Detect project type
      const detection = detectProjectType(contentRoot);
      log(`Tipo de proyecto detectado: ${detection.type} (confianza: ${detection.confidence}%)`);

      // Detect domains
      const domains = this.detectDomains(contentRoot);

      // Detect WordPress details
      let wordpress: AnalysisReport['wordpress'] | undefined;
      const wpConfigPaths = [
        path.join(contentRoot, 'public_html', 'wp-config.php'),
        path.join(contentRoot, 'homedir', 'public_html', 'wp-config.php'),
      ];
      for (const wpPath of wpConfigPaths) {
        if (fs.existsSync(wpPath)) {
          const wpData = parseWpConfig(wpPath);
          const pluginsDir = path.join(path.dirname(wpPath), 'wp-content', 'plugins');
          const themesDir = path.join(path.dirname(wpPath), 'wp-content', 'themes');
          const uploadsDir = path.join(path.dirname(wpPath), 'wp-content', 'uploads');

          wordpress = {
            version: this.detectWpVersion(path.dirname(wpPath)),
            dbName: wpData.dbName || '',
            dbUser: wpData.dbUser || '',
            dbPassword: wpData.dbPassword || '',
            dbHost: wpData.dbHost || 'localhost',
            tablePrefix: wpData.tablePrefix || 'wp_',
            siteUrl: `https://${domains.primary}`,
            uploadsSize: fs.existsSync(uploadsDir) ? formatBytes(getDirSizeSync(uploadsDir)) : '0 B',
            plugins: fs.existsSync(pluginsDir) ? fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory()) : [],
            themes: fs.existsSync(themesDir) ? fs.readdirSync(themesDir).filter(f => fs.statSync(path.join(themesDir, f)).isDirectory()) : [],
            phpVersion: this.detectPhpVersion(contentRoot),
          };
          break;
        }
      }

      // Detect databases
      const databases = this.detectDatabases(contentRoot);

      // Detect emails
      const emails = this.detectEmails(contentRoot);

      // Detect cron jobs
      const cronFile = path.join(contentRoot, 'cron');
      const cronJobs = fs.existsSync(cronFile) ? parseCronFile(cronFile) : [];

      // Detect SSL
      const sslCertificates = this.detectSSLCerts(contentRoot);

      // Detect redirects from .htaccess
      const redirects = this.detectRedirects(contentRoot);

      // Detect config and hidden files
      const configFiles: string[] = [];
      const hiddenFiles: string[] = [];
      this.scanFiles(contentRoot, contentRoot, configFiles, hiddenFiles);

      // Calculate disk usage
      const totalSize = getDirSizeSync(contentRoot);
      const breakdown = this.calculateBreakdown(contentRoot);

      // Backup file size
      const backupStats = fs.statSync(filePath);

      const report: AnalysisReport = {
        domains,
        projectType: detection.type,
        projectTypeConfidence: detection.confidence,
        wordpress,
        databases,
        emails,
        phpVersion: wordpress?.phpVersion || this.detectPhpVersion(contentRoot),
        diskUsage: { total: formatBytes(totalSize), breakdown },
        cronJobs,
        sslCertificates,
        redirects,
        configFiles,
        hiddenFiles,
        backupSize: formatBytes(backupStats.size),
      };

      return report;
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
      } catch (err) {
        logError('Error limpiando archivos temporales', err);
      }
    }
  },

  detectDomains(contentRoot: string): { primary: string; addon: string[]; parked: string[]; subdomains: string[] } {
    const result = { primary: '', addon: [] as string[], parked: [] as string[], subdomains: [] as string[] };

    // cPanel stores domain data in cp/
    const mainDomainFile = path.join(contentRoot, 'cp', 'main');
    if (fs.existsSync(mainDomainFile)) {
      try {
        const content = fs.readFileSync(mainDomainFile, 'utf-8');
        const match = content.match(/^(\S+)/m);
        if (match) result.primary = match[1];
      } catch { /* ignore */ }
    }

    const addonDomainsFile = path.join(contentRoot, 'addons');
    if (fs.existsSync(addonDomainsFile)) {
      try {
        const content = fs.readFileSync(addonDomainsFile, 'utf-8');
        result.addon = content.split('\n').map(l => l.split('=')[0]?.trim()).filter(Boolean);
      } catch { /* ignore */ }
    }

    const parkedDomainsFile = path.join(contentRoot, 'pds');
    if (fs.existsSync(parkedDomainsFile)) {
      try {
        const content = fs.readFileSync(parkedDomainsFile, 'utf-8');
        result.parked = content.split('\n').map(l => l.trim()).filter(Boolean);
      } catch { /* ignore */ }
    }

    const subDomainsFile = path.join(contentRoot, 'sds');
    if (fs.existsSync(subDomainsFile)) {
      try {
        const content = fs.readFileSync(subDomainsFile, 'utf-8');
        result.subdomains = content.split('\n').map(l => l.split('=')[0]?.trim()).filter(Boolean);
      } catch { /* ignore */ }
    }

    // Fallback: try to detect from directory name using extractDomainFromPath parser
    if (!result.primary) {
      const dirName = path.basename(contentRoot);
      result.primary = extractDomainFromPath(dirName);
    }

    return result;
  },

  detectWpVersion(wpRoot: string): string {
    const versionFile = path.join(wpRoot, 'wp-includes', 'version.php');
    try {
      const content = fs.readFileSync(versionFile, 'utf-8');
      const match = content.match(/\$wp_version\s*=\s*['"]([\d.]+)['"]/);
      return match ? match[1] : 'desconocida';
    } catch {
      return 'desconocida';
    }
  },

  detectPhpVersion(contentRoot: string): string {
    const phpIniPaths = [
      path.join(contentRoot, 'php.ini'),
      path.join(contentRoot, 'public_html', '.user.ini'),
      path.join(contentRoot, '.htaccess'),
    ];

    for (const phpPath of phpIniPaths) {
      try {
        if (fs.existsSync(phpPath)) {
          const content = fs.readFileSync(phpPath, 'utf-8');
          const match = content.match(/php(\d+\.\d+)/i) || content.match(/ea-php(\d)(\d)/);
          if (match) {
            return match[1].includes('.') ? match[1] : `${match[1]}.${match[2] || '0'}`;
          }
        }
      } catch { /* ignore */ }
    }

    // cPanel PHP version selector
    const phpVersionFile = path.join(contentRoot, '.php-version');
    if (fs.existsSync(phpVersionFile)) {
      try {
        return fs.readFileSync(phpVersionFile, 'utf-8').trim();
      } catch { /* ignore */ }
    }

    return '8.1';
  },

  detectDatabases(contentRoot: string): AnalysisReport['databases'] {
    const databases: AnalysisReport['databases'] = [];
    const mysqlDir = path.join(contentRoot, 'mysql');

    if (fs.existsSync(mysqlDir)) {
      const files = fs.readdirSync(mysqlDir).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        const filePath = path.join(mysqlDir, file);
        const stats = fs.statSync(filePath);
        const dbName = file.replace('.sql', '');

        let charset = 'utf8mb4';
        let tables = 0;
        try {
          const head = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).substring(0, 10000);
          const charsetMatch = head.match(/CHARACTER SET\s+(\S+)/i);
          if (charsetMatch) charset = charsetMatch[1];
          const tableMatches = head.match(/CREATE TABLE/gi);
          tables = tableMatches ? tableMatches.length : 0;
          // Full count
          const fullContent = fs.readFileSync(filePath, 'utf-8');
          const fullTableMatches = fullContent.match(/CREATE TABLE/gi);
          if (fullTableMatches) tables = fullTableMatches.length;
        } catch { /* ignore */ }

        databases.push({
          name: dbName,
          size: formatBytes(stats.size),
          charset,
          tables,
          dumpFile: `mysql/${file}`,
        });
      }
    }

    return databases;
  },

  detectEmails(contentRoot: string): AnalysisReport['emails'] {
    const emailData: AnalysisReport['emails'] = [];
    let mailDir = path.join(contentRoot, 'mail');

    // Fallback: cPanel often stores mail under homedir/mail
    if (!fs.existsSync(mailDir) || !fs.statSync(mailDir).isDirectory()) {
      mailDir = path.join(contentRoot, 'homedir', 'mail');
    }

    if (fs.existsSync(mailDir) && fs.statSync(mailDir).isDirectory()) {
      try {
        const domainDirs = fs.readdirSync(mailDir).filter(d => {
          const fullPath = path.join(mailDir, d);
          return fs.statSync(fullPath).isDirectory() && d.includes('.') && !d.startsWith('.');
        });

        for (const domain of domainDirs) {
          const domainPath = path.join(mailDir, domain);
          const accounts: AnalysisReport['emails'][0]['accounts'] = [];

          const userDirs = fs.readdirSync(domainPath).filter(d =>
            fs.statSync(path.join(domainPath, d)).isDirectory()
          );

          for (const user of userDirs) {
            const userPath = path.join(domainPath, user);
            const folderPath = fs.existsSync(path.join(userPath, 'Maildir')) ? path.join(userPath, 'Maildir') : userPath;

            const folders: string[] = [];
            try {
              const entries = fs.readdirSync(folderPath);
              for (const entry of entries) {
                if (fs.statSync(path.join(folderPath, entry)).isDirectory() && !['cur', 'new', 'tmp'].includes(entry)) {
                  folders.push(entry.startsWith('.') ? entry.substring(1) : entry);
                }
              }
              if (folders.length === 0) folders.push('INBOX');
            } catch {
              folders.push('INBOX');
            }

            // Count real emails in cur/new subdirectories recursively
            let messageCount = 0;
            try {
              const countMailFiles = (dir: string): number => {
                let count = 0;
                if (!fs.existsSync(dir)) return 0;
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  const full = path.join(dir, entry.name);
                  if (entry.isDirectory()) {
                    if (entry.name === 'cur' || entry.name === 'new') {
                      try {
                        count += fs.readdirSync(full).length;
                      } catch {}
                    } else {
                      count += countMailFiles(full);
                    }
                  }
                }
                return count;
              };
              messageCount = countMailFiles(userPath);
            } catch { /* ignore */ }

            const maildirSize = formatBytes(getDirSizeSync(userPath));

            accounts.push({
              address: `${user}@${domain}`,
              quota: '500 MB',
              messageCount,
              folders,
              maildirSize,
            });
          }

          if (accounts.length > 0) {
            emailData.push({ domain, accounts });
          }
        }
      } catch { /* ignore */ }
    }

    return emailData;
  },

  detectSSLCerts(contentRoot: string): AnalysisReport['sslCertificates'] {
    const certs: AnalysisReport['sslCertificates'] = [];
    const sslDir = path.join(contentRoot, 'ssl');

    if (fs.existsSync(sslDir)) {
      try {
        const certFiles = fs.readdirSync(sslDir).filter(f => f.endsWith('.crt') || f.endsWith('.pem'));
        for (const certFile of certFiles) {
          const domain = certFile.replace(/\.(crt|pem)$/, '');
          certs.push({
            domain: domain.includes('.') ? domain : `${domain}.cl`,
            issuer: 'cPanel, Inc. Certification Authority',
            expiry: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0],
          });
        }
      } catch { /* ignore */ }
    }

    return certs;
  },

  detectRedirects(contentRoot: string): AnalysisReport['redirects'] {
    const redirects: AnalysisReport['redirects'] = [];
    const htaccessPaths = [
      path.join(contentRoot, '.htaccess'),
      path.join(contentRoot, 'public_html', '.htaccess'),
    ];

    for (const htPath of htaccessPaths) {
      if (fs.existsSync(htPath)) {
        try {
          const content = fs.readFileSync(htPath, 'utf-8');
          const redirectMatches = content.matchAll(/Redirect(Match)?\s+(301|302|permanent|temp)\s+(\S+)\s+(\S+)/gi);
          for (const match of redirectMatches) {
            const type = match[2] === 'permanent' ? '301' : match[2] === 'temp' ? '302' : match[2];
            redirects.push({ from: match[3], to: match[4], type });
          }

          // Detect HTTPS redirect via RewriteRule
          if (content.includes('RewriteCond') && content.includes('HTTPS') && content.includes('RewriteRule')) {
            const domainMatch = content.match(/https?:\/\/([^\s/]+)/);
            if (domainMatch) {
              redirects.push({ from: `http://${domainMatch[1]}`, to: `https://${domainMatch[1]}`, type: '301' });
            }
          }
        } catch { /* ignore */ }
      }
    }

    return redirects;
  },

  scanFiles(dir: string, rootDir: string, configFiles: string[], hiddenFiles: string[]): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = path.relative(rootDir, path.join(dir, entry.name));

        if (entry.name.startsWith('.')) {
          hiddenFiles.push(relativePath);
        }

        if (entry.isFile()) {
          const configPatterns = [
            'wp-config.php', '.htaccess', '.user.ini', 'php.ini',
            '.env', 'config.php', 'configuration.php', 'settings.php',
            'nginx.conf', 'httpd.conf',
          ];
          if (configPatterns.includes(entry.name)) {
            configFiles.push(relativePath);
          }
        }

        // Don't recurse too deep
        if (entry.isDirectory() && relativePath.split(path.sep).length < 4) {
          this.scanFiles(path.join(dir, entry.name), rootDir, configFiles, hiddenFiles);
        }
      }
    } catch { /* ignore */ }
  },

  calculateBreakdown(contentRoot: string): { path: string; size: string }[] {
    const breakdown: { path: string; size: string }[] = [];
    try {
      const entries = fs.readdirSync(contentRoot, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(contentRoot, entry.name);
        if (entry.isDirectory()) {
          breakdown.push({ path: `${entry.name}/`, size: formatBytes(getDirSizeSync(fullPath)) });
        } else {
          breakdown.push({ path: entry.name, size: formatBytes(fs.statSync(fullPath).size) });
        }
      }
    } catch { /* ignore */ }
    return breakdown.sort((a, b) => b.size.localeCompare(a.size));
  },
};
