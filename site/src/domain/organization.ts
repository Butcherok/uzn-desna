/**
 * Разметка Schema.org предприятия для главной (ТЗ 11.4, решение 039).
 *
 * Тип — `GovernmentOrganization`: подтип `Organization`, им размечает
 * организации GOV.UK; Google велит брать самый точный подтип и распознаёт
 * у него поля `Organization`. Поля — только из распознаваемых Google и только
 * подтверждённые данными `data/*.json`. `taxID` — код ЄДРПОУ: для юридической
 * особи он и есть податковий номер (Порядок обліку платників податків,
 * наказ Мінфіну № 1588, розд. II, п. 2.2).
 */
import type { Contact, Enterprise } from '@uzn/shared';

export interface OrganizationInput {
  enterprise: Enterprise;
  /** Телефон приймальні — общий номер предприятия */
  office: Contact | undefined;
  name: string;
  /** Абсолютный адрес главной */
  url: string;
  /** Абсолютный адрес растрового знака не меньше 112×112 */
  logoUrl: string;
  /** Страницы того же предприятия на других сайтах */
  sameAs: readonly string[];
  postalCode: string;
  streetAddress: string;
  locality: string;
}

export function organizationJsonLd(input: OrganizationInput): Record<string, unknown> {
  const { enterprise, office } = input;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentOrganization',
    '@id': `${input.url}#organization`,
    name: input.name,
    legalName: enterprise.nameFull.uk,
    url: input.url,
    logo: input.logoUrl,
    taxID: enterprise.edrpou,
    address: {
      '@type': 'PostalAddress',
      streetAddress: input.streetAddress,
      addressLocality: input.locality,
      postalCode: input.postalCode,
      addressCountry: 'UA',
    },
    sameAs: [...input.sameAs],
  };
  if (office) data.telephone = office.phone;
  if (enterprise.email) data.email = enterprise.email;
  if (enterprise.registeredAt) data.foundingDate = enterprise.registeredAt;
  return data;
}
