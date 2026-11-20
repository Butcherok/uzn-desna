import { describe, expect, it } from 'vitest';
import type { Contact, Enterprise } from '@uzn/shared';
import { organizationJsonLd, type OrganizationInput } from './organization';

const enterprise = {
  nameFull: { uk: 'Комунальне підприємство по утриманню зелених насаджень' },
  edrpou: '04589645',
  email: 'kpuzn07@gmail.com',
  registeredAt: '2002-01-09',
} as Enterprise;

const office = {
  slug: 'pryimalnia',
  purpose: { uk: 'Приймальня' },
  phone: '+380443373501',
  roundClock: false,
  confirmed: true,
  showInFooter: true,
  order: 1,
} as Contact;

const input = (over: Partial<OrganizationInput> = {}): OrganizationInput => ({
  enterprise,
  office,
  name: 'КП УЗН Деснянського району',
  url: 'https://example.org/uzn-desna/',
  logoUrl: 'https://example.org/uzn-desna/logo-512.png',
  sameAs: ['https://www.facebook.com/kpuzndesn'],
  postalCode: '02232',
  streetAddress: 'вул. Героїв Енергетиків, 26',
  locality: 'Київ',
  ...over,
});

describe('organizationJsonLd', () => {
  it('builds GovernmentOrganization with ЄДРПОУ as taxID and a Ukrainian address', () => {
    const data = organizationJsonLd(input());
    expect(data['@type']).toBe('GovernmentOrganization');
    expect(data['@id']).toBe('https://example.org/uzn-desna/#organization');
    expect(data.taxID).toBe('04589645');
    expect(data.legalName).toBe(enterprise.nameFull.uk);
    expect(data.address).toMatchObject({ addressCountry: 'UA', postalCode: '02232' });
    expect(data.telephone).toBe('+380443373501');
    expect(data.email).toBe('kpuzn07@gmail.com');
    expect(data.foundingDate).toBe('2002-01-09');
  });

  it('omits fields that have no data instead of inventing them', () => {
    const data = organizationJsonLd(
      input({
        office: undefined,
        enterprise: { ...enterprise, email: undefined, registeredAt: undefined },
      }),
    );
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('foundingDate');
  });
});
