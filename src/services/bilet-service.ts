import type { BiletAccountInfo, BiletCatalogItem, BiletTicket } from '../types.js';

export class BiletTBService {
  private static instance: BiletTBService;

  private readonly stbBackofficeUrl = 'https://online.stbsa.ro:8080/external';

  private readonly officialCatalog: BiletCatalogItem[] = [
    {
      id: 1,
      name: 'Bilet metropolitan 90 minute',
      group: 'Urban București - Ilfov',
      fareRon: 3.0,
      validMinutes: 90,
      description: 'Valabil 90 de minute de la validare pe toate liniile de transport public de suprafață din București și Ilfov (autobuze, troleibuze, tramvaie).'
    },
    {
      id: 2,
      name: 'Bilet metropolitan 24 ore',
      group: 'Urban București - Ilfov',
      fareRon: 8.0,
      validMinutes: 1440,
      description: 'Călătorii nelimitate timp de 24 de ore de la prima validare pe întreaga rețea de suprafață STB din regiunea metropolitană.'
    },
    {
      id: 3,
      name: 'Bilet metropolitan 72 ore',
      group: 'Urban București - Ilfov',
      fareRon: 20.0,
      validMinutes: 4320,
      description: 'Călătorii nelimitate timp de 72 de ore (3 zile) pe rețeaua metropolitană de suprafață din București și Ilfov.'
    },
    {
      id: 4,
      name: 'Abonament metropolitan 30 zile',
      group: 'Urban București - Ilfov',
      fareRon: 80.0,
      validMinutes: 43200,
      description: 'Călătorii nelimitate timp de 30 de zile pe toate liniile STB din regiunea București - Ilfov.'
    },
    {
      id: 5,
      name: 'Bilet metropolitan și tren 24 ore',
      group: 'Expres / Tren',
      fareRon: 20.0,
      validMinutes: 1440,
      description: 'Valabil 24h pe rețeaua de suprafață STB + trenul de legătură Gara de Nord - Aeroport Otopeni Henri Coandă.'
    },
    {
      id: 6,
      name: 'Abonament metropolitan și tren 30 zile',
      group: 'Expres / Tren',
      fareRon: 140.0,
      validMinutes: 43200,
      description: 'Călătorii nelimitate 30 de zile pe rețeaua metropolitană de suprafață STB + trenul feroviar spre Aeroportul Henri Coandă Otopeni.'
    },
    {
      id: 7,
      name: 'Abonament gratuit elevi / studenți',
      group: 'Social / Redus',
      fareRon: 0.0,
      validMinutes: 525600,
      description: 'Titlu de călătorie anual 100% gratuit destinat elevilor și studenților conform legislației în vigoare, activabil prin YouthTB / Bilet TB.'
    }
  ];

  public static getInstance(): BiletTBService {
    if (!BiletTBService.instance) {
      BiletTBService.instance = new BiletTBService();
    }
    return BiletTBService.instance;
  }

  private constructor() {}

  /**
   * Return standard catalog of public transport tickets and passes
   */
  public getCatalog(): BiletCatalogItem[] {
    return this.officialCatalog;
  }

  /**
   * Authenticate with official STB backoffice API
   */
  public async authenticate(username: string, password: string): Promise<string> {
    const res = await fetch(`${this.stbBackofficeUrl}/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'BucharestTransitInteractiveApp/1.0 (Mozilla/5.0)'
      },
      body: JSON.stringify({
        username: username.trim(),
        password: password.trim(),
        rememberMe: true,
        deviceUuid: 'bucharest-transit-mcp-client'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`STB authentication failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as { id_token?: string };
    if (!data.id_token) {
      throw new Error('STB backoffice did not return an id_token');
    }

    return data.id_token;
  }

  /**
   * Fetch user account info from STB backoffice
   */
  public async getAccount(token: string): Promise<BiletAccountInfo> {
    const res = await fetch(`${this.stbBackofficeUrl}/account`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'BucharestTransitInteractiveApp/1.0 (Mozilla/5.0)'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch STB account: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const fareCategory = data.fareCategory?.name?.toLowerCase() || '';
    const isStudent = fareCategory === 'elev' || fareCategory === 'pupil' || fareCategory === 'student';

    return {
      id: data.id,
      login: data.login,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      category: data.fareCategory?.description || data.fareCategory?.name,
      isStudent
    };
  }

  /**
   * Fetch active travel titles and QR codes
   */
  public async getActiveTickets(token: string): Promise<BiletTicket[]> {
    const payload = {
      filter: {
        isActive: true,
        expirationMinutesDelay: 0
      },
      paging: {
        pageNo: 1,
        size: 50
      }
    };

    const res = await fetch(`${this.stbBackofficeUrl}/active-user-tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'BucharestTransitInteractiveApp/1.0 (Mozilla/5.0)'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch active tickets: HTTP ${res.status}`);
    }

    const rawList = (await res.json()) as any[];
    if (!Array.isArray(rawList)) return [];

    return rawList.map((item) => {
      const pkg = item.ticketPackage || {};
      const ticketObj = pkg.ticket || {};
      const title = ticketObj.name || item.title || 'Titlu de călătorie';
      const categoryName = pkg.fareCategory?.name?.toLowerCase() || '';
      const isElev = categoryName === 'elev' || categoryName === 'student' || title.toLowerCase().includes('elev');

      const validTo = item.validToDate;
      let remainingSec: number | undefined;
      if (validTo) {
        const toDate = new Date(validTo);
        if (!isNaN(toDate.getTime())) {
          remainingSec = Math.max(0, Math.floor((toDate.getTime() - Date.now()) / 1000));
        }
      }

      return {
        id: String(item.id),
        title,
        type: isElev ? 'student' : 'calatorie',
        seriesCode: item.qrCodeCode,
        validFromDate: item.validFromDate,
        validToDate: validTo,
        remainingSeconds: remainingSec,
        isStudentOrPupil: isElev,
        status: item.status || 'active',
        qrPayload: item.qrCode
      };
    });
  }

  /**
   * Helper to resolve active token from options or environment variables
   */
  public resolveToken(providedToken?: string): string | undefined {
    return (
      providedToken ||
      process.env.STB_BILET_TOKEN ||
      process.env.BILET_TB_TOKEN ||
      undefined
    );
  }
}
