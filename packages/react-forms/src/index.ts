export { useSnowtrackerForm } from './useSnowtrackerForm.js';
export type {
  FormOverrides,
  FormValueKey,
  FormValues,
  UseSnowtrackerFormOptions,
  UseSnowtrackerFormResult,
} from './useSnowtrackerForm.js';

// Re-export what a form integration needs so `@snowtrackerpro/sdk-core`
// never has to be imported directly for the common path.
export {
  createClient,
  LEAD_CATALOG_VERSION,
  LEAD_FIELDS,
  SnowTrackerError,
  validateLead,
} from '@snowtrackerpro/sdk-core';
export type {
  ClientOptions,
  FormField,
  FormKind,
  FormOption,
  FormSchema,
  LeadAddressParts,
  LeadFieldKey,
  LeadFields,
  LeadFieldValues,
  SnowTrackerClient,
  SubmitLeadResult,
} from '@snowtrackerpro/sdk-core';
