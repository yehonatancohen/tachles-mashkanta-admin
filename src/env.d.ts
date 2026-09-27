/// <reference types="astro/client" />
import type { AccessIdentity } from './server/access';

declare global {
  namespace App {
    interface Locals {
      access: AccessIdentity;
    }
  }
}

export {};
