/**
 * Team role-based permission middleware.
 *
 * Checks whether the authenticated user has the required team role
 * to access a route. Role hierarchy: OWNER > ADMIN > MEMBER.
 *
 * This middleware runs AFTER auth middleware and checks the team_members
 * table for dashboard-authenticated users. API key users bypass this
 * check since their permissions are governed by the scope middleware.
 */

import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import type { ApiErrorResponse } from "../../types/index.js";
import type { TeamRole } from "@prisma/client";
import { prisma } from "../../db/client.js";

/**
 * Role hierarchy — higher index = more permissions.
 */
const ROLE_HIERARCHY: Record<string, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

/**
 * Creates middleware that requires a minimum team role.
 * For API key-authenticated requests, the scope middleware handles
 * permissions, so this middleware passes through.
 * For dashboard-authenticated requests, it checks the team_members table.
 *
 * The account owner (the Customer record itself) is always treated as OWNER.
 *
 * @param minRole - The minimum role required to access the route
 * @returns Express middleware function
 */
export function requireRole(minRole: TeamRole) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      next();
      return;
    }

    // API key requests are governed by scope middleware, not team roles
    if (apiKey.id !== "dashboard-internal") {
      next();
      return;
    }

    // Dashboard user — the customer account owner has OWNER role implicitly
    const customerId = apiKey.customerId;
    const customerEmail = apiKey.customer.email;

    // Check if this user is a team member
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        customerId,
        email: customerEmail,
        acceptedAt: { not: null },
      },
    });

    // If no team member record, this is the account owner
    const userRole: TeamRole = teamMember ? teamMember.role : "OWNER";
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      const errorResponse: ApiErrorResponse = {
        error: "Insufficient team permissions",
        code: "INSUFFICIENT_ROLE",
      };
      res.status(403).json(errorResponse);
      return;
    }

    next();
  };
}
