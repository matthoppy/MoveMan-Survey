/**
 * Who the customer is actually dealing with.
 *
 * The privacy notice has to name a real data controller and give a real way to
 * reach them — "the removals company" is not a contact address. These are read
 * from configuration rather than the database because the notice is shown on
 * the capture page, which resolves a survey by token and should not need a
 * second query to render its own small print.
 */

export interface CompanyIdentity {
  name: string;
  /** Where a customer sends a deletion request. */
  contactEmail: string;
  /** Optional postal address, shown in the privacy notice when set. */
  postalAddress: string;
  /** True when the operator has actually filled these in. */
  configured: boolean;
}

export function companyIdentity(): CompanyIdentity {
  const name = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() ?? "";
  const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ?? "";

  return {
    name: name || "Your removals company",
    contactEmail,
    postalAddress: process.env.NEXT_PUBLIC_COMPANY_ADDRESS?.trim() ?? "",
    configured: Boolean(name && contactEmail),
  };
}
