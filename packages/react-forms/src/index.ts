export { useSnowTrackerForm, useSnowtrackerForm } from './useSnowTrackerForm.js';
export type {
  FormOverrides,
  FormStatus,
  FormValueKey,
  FormValues,
  UseSnowTrackerFormOptions,
  UseSnowTrackerFormResult,
  UseSnowtrackerFormOptions,
  UseSnowtrackerFormResult,
} from './useSnowTrackerForm.js';

// Re-export what a form integration needs so `@snowtrackerpro/sdk-core`
// never has to be imported directly for the common path.
export {
  createClient,
  LEAD_CATALOG_VERSION,
  LEAD_FIELDS,
  LEAD_LIMITS,
  SnowTrackerError,
  validateExtra,
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
  SnowTrackerErrorCode,
  SubmitLeadResult,
} from '@snowtrackerpro/sdk-core';
