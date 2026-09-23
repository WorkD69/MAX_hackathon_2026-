import { z } from 'zod';
import {
  ResultRequirementSchema, RoleSchema, UuidSchema,
  NonEmptyStringSchema,
} from './primitives.js';

export const HousePathSchema = z.strictObject({ houseId: UuidSchema });
export const CategoryPathSchema = z.strictObject({ categoryId: UuidSchema });
export const ContractorPathSchema = z.strictObject({ contractorId: UuidSchema });
export const UserPathSchema = z.strictObject({ appUserId: UuidSchema });
export const ContractorEmployeePathSchema = z.strictObject({
  contractorId: UuidSchema, appUserId: UuidSchema,
});
export const OrganizationPatchRequestSchema = z.strictObject({ name: NonEmptyStringSchema });
export const HouseCreateRequestSchema = z.strictObject({
  address: NonEmptyStringSchema, display_label: z.string().nullable(), active: z.boolean(),
});
export const HousePatchRequestSchema = HouseCreateRequestSchema.partial().refine(
  (body) => Object.keys(body).length > 0, { message: 'House patch must not be empty' },
);
export const CategoryCreateRequestSchema = z.strictObject({
  name: NonEmptyStringSchema,
  description: z.string().nullable(),
  default_contractor_id: UuidSchema.nullable(),
  requires_premises_access: z.boolean(),
  result_requirement: ResultRequirementSchema,
  active: z.boolean(),
});
export const CategoryPatchRequestSchema = CategoryCreateRequestSchema.partial().refine(
  (body) => Object.keys(body).length > 0, { message: 'Category patch must not be empty' },
);
export const ContractorCreateRequestSchema = z.strictObject({
  display_name: NonEmptyStringSchema,
});
export const ContractorBindingPutRequestSchema = z.strictObject({ active: z.boolean() });
export const UserRoleBindingPutRequestSchema = z.strictObject({
  role: RoleSchema, contractor_id: UuidSchema.nullable(),
  house_ids: z.array(UuidSchema), active: z.boolean().optional(),
});
export const ContractorEmployeePutRequestSchema = z.strictObject({ active: z.boolean() });

export const OrganizationReadResponseSchema = z.strictObject({
  organization_id: UuidSchema, name: z.string(), active: z.boolean(),
});
export const HouseReadSchema = z.strictObject({
  house_id: UuidSchema, address: z.string(), display_label: z.string().nullable(),
  active: z.boolean(),
});
export const HousesReadResponseSchema = z.array(HouseReadSchema);
export const CategoryReadSchema = z.strictObject({
  category_id: UuidSchema, name: z.string(), description: z.string().nullable(),
  default_contractor_id: UuidSchema.nullable(),
  requires_premises_access: z.boolean(), result_requirement: ResultRequirementSchema,
  active: z.boolean(),
});
export const CategoriesReadResponseSchema = z.array(CategoryReadSchema);
export const ContractorReadSchema = z.strictObject({
  contractor: z.strictObject({
    contractor_id: UuidSchema, display_name: z.string(), active: z.boolean(),
  }),
  organization_contractor: z.strictObject({
    organization_id: UuidSchema, contractor_id: UuidSchema, active: z.boolean(),
  }),
});
export const ContractorsReadResponseSchema = z.array(ContractorReadSchema);
export const UserReadSchema = z.strictObject({
  app_user: z.strictObject({
    app_user_id: UuidSchema, display_name: z.string(), active: z.boolean(),
  }),
  role_bindings: z.array(z.strictObject({
    role_binding_id: UuidSchema, role: RoleSchema, organization_id: UuidSchema.nullable(),
    contractor_id: UuidSchema.nullable(), active: z.boolean(),
  })),
  uk_house_access: z.array(z.strictObject({ house_id: UuidSchema, active: z.boolean() })),
});
export const UsersReadResponseSchema = z.array(UserReadSchema);
