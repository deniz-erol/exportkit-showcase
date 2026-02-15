import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMember, TeamRole } from "@prisma/client";

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCount = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    teamMember: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

const {
  inviteTeamMember,
  acceptInvitation,
  removeTeamMember,
  updateMemberRole,
  listTeamMembers,
  findByInviteToken,
  TeamServiceError,
} = await import("../team-service.js");

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "tm-1",
    customerId: "cust-1",
    email: "member@example.com",
    passwordHash: null,
    role: "MEMBER" as TeamRole,
    invitedAt: new Date("2026-01-01T00:00:00Z"),
    acceptedAt: null,
    inviteToken: "test-token-abc",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("TeamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("inviteTeamMember", () => {
    it("creates a pending team member with invite token", async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockImplementation(({ data }) =>
        Promise.resolve(makeMember({ email: data.email, role: data.role, inviteToken: data.inviteToken }))
      );

      const result = await inviteTeamMember({
        customerId: "cust-1",
        email: "new@example.com",
        role: "MEMBER",
      });

      expect(result.email).toBe("new@example.com");
      expect(result.role).toBe("MEMBER");
      expect(result.inviteToken).toBeTruthy();
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("throws ALREADY_MEMBER if email already exists in org", async () => {
      mockFindUnique.mockResolvedValue(makeMember());

      await expect(
        inviteTeamMember({ customerId: "cust-1", email: "member@example.com", role: "MEMBER" })
      ).rejects.toThrow(TeamServiceError);

      await expect(
        inviteTeamMember({ customerId: "cust-1", email: "member@example.com", role: "MEMBER" })
      ).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
    });

    it("throws INVALID_ROLE when trying to invite as OWNER", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        inviteTeamMember({ customerId: "cust-1", email: "new@example.com", role: "OWNER" })
      ).rejects.toMatchObject({ code: "INVALID_ROLE" });
    });
  });

  describe("acceptInvitation", () => {
    it("marks member as accepted and sets password hash", async () => {
      const pending = makeMember();
      mockFindUnique.mockResolvedValue(pending);
      mockUpdate.mockImplementation(({ data }) =>
        Promise.resolve(makeMember({ ...data, acceptedAt: new Date() }))
      );

      const result = await acceptInvitation("test-token-abc", "hashed-pw");

      expect(result.acceptedAt).toBeTruthy();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tm-1" },
          data: expect.objectContaining({
            passwordHash: "hashed-pw",
            inviteToken: null,
          }),
        })
      );
    });

    it("throws INVALID_INVITE for unknown token", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(acceptInvitation("bad-token", "pw")).rejects.toMatchObject({
        code: "INVALID_INVITE",
      });
    });

    it("throws ALREADY_ACCEPTED if already accepted", async () => {
      mockFindUnique.mockResolvedValue(makeMember({ acceptedAt: new Date() }));

      await expect(acceptInvitation("test-token-abc", "pw")).rejects.toMatchObject({
        code: "ALREADY_ACCEPTED",
      });
    });
  });

  describe("removeTeamMember", () => {
    it("deletes a non-owner member", async () => {
      mockFindFirst.mockResolvedValue(makeMember());
      mockDelete.mockResolvedValue(makeMember());

      const result = await removeTeamMember("cust-1", "tm-1");

      expect(result.id).toBe("tm-1");
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "tm-1" } });
    });

    it("throws MEMBER_NOT_FOUND for unknown member", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(removeTeamMember("cust-1", "tm-999")).rejects.toMatchObject({
        code: "MEMBER_NOT_FOUND",
      });
    });

    it("throws CANNOT_REMOVE_OWNER for owner role", async () => {
      mockFindFirst.mockResolvedValue(makeMember({ role: "OWNER" }));

      await expect(removeTeamMember("cust-1", "tm-1")).rejects.toMatchObject({
        code: "CANNOT_REMOVE_OWNER",
      });
    });
  });

  describe("updateMemberRole", () => {
    it("updates role for a non-owner member", async () => {
      mockFindFirst.mockResolvedValue(makeMember());
      mockUpdate.mockResolvedValue(makeMember({ role: "ADMIN" }));

      const result = await updateMemberRole("cust-1", "tm-1", "ADMIN");

      expect(result.role).toBe("ADMIN");
    });

    it("throws CANNOT_CHANGE_OWNER when target is owner", async () => {
      mockFindFirst.mockResolvedValue(makeMember({ role: "OWNER" }));

      await expect(updateMemberRole("cust-1", "tm-1", "ADMIN")).rejects.toMatchObject({
        code: "CANNOT_CHANGE_OWNER",
      });
    });

    it("throws INVALID_ROLE when promoting to OWNER", async () => {
      mockFindFirst.mockResolvedValue(makeMember());

      await expect(updateMemberRole("cust-1", "tm-1", "OWNER")).rejects.toMatchObject({
        code: "INVALID_ROLE",
      });
    });

    it("throws MEMBER_NOT_FOUND for unknown member", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(updateMemberRole("cust-1", "tm-999", "ADMIN")).rejects.toMatchObject({
        code: "MEMBER_NOT_FOUND",
      });
    });
  });

  describe("listTeamMembers", () => {
    it("returns all members for a customer", async () => {
      const members = [makeMember(), makeMember({ id: "tm-2", email: "admin@example.com", role: "ADMIN" })];
      mockFindMany.mockResolvedValue(members);
      mockCount.mockResolvedValue(2);

      const result = await listTeamMembers("cust-1");

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: "cust-1" } })
      );
    });
  });

  describe("findByInviteToken", () => {
    it("returns member for valid token", async () => {
      mockFindUnique.mockResolvedValue(makeMember());

      const result = await findByInviteToken("test-token-abc");

      expect(result?.id).toBe("tm-1");
    });

    it("returns null for unknown token", async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await findByInviteToken("bad-token");

      expect(result).toBeNull();
    });
  });
});
