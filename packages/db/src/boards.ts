import { ModuleKey } from '@prisma/client';
import { assertCan, assertModule, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';

export async function listBoards(actor: StaffActor) {
  return withTenant(scopeFor(actor), async (tx) => {
    const bodies = await tx.body.findMany({
      include: {
        government: true,
        seats: {
          include: {
            terms: { include: { person: true }, orderBy: { startsOn: 'desc' } },
            applications: { orderBy: { createdAt: 'desc' } },
            appointingGovernment: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    const now = new Date();
    return bodies.map((body) => ({
      id: body.id,
      name: body.name,
      code: body.code,
      government: body.government.shortName,
      governmentId: body.governmentId,
      seats: body.seats.map((seat) => {
        const current = seat.terms.find((term) => term.startsOn <= now && (!term.endsOn || term.endsOn >= now));
        const vacant = !current;
        return {
          id: seat.id,
          label: seat.label,
          appointmentNotes: seat.appointmentNotes,
          appointingGovernment: seat.appointingGovernment?.shortName ?? null,
          vacant,
          current: current
            ? {
                person: current.person.fullName,
                startsOn: current.startsOn.toISOString(),
                endsOn: current.endsOn?.toISOString() ?? null,
                isChair: current.isChair,
              }
            : null,
          applications: seat.applications.map((application) => ({
            id: application.id,
            name: application.name,
            email: application.email,
            statement: application.statement,
            status: application.status,
          })),
        };
      }),
    }));
  });
}

export async function createSeat(
  actor: StaffActor,
  input: { bodyId: string; label: string; appointingGovernmentId?: string; appointmentNotes?: string },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const body = await tx.body.findUnique({ where: { id: input.bodyId } });
    if (!body) throw new DomainError(404, 'Body not found');
    await assertModule(tx, body.governmentId, ModuleKey.BOARDS);
    assertCan(actor, 'government.configure', { governmentId: body.governmentId });
    const seat = await tx.seat.create({ data: input });
    await writeAudit(tx, {
      governmentId: body.governmentId,
      actorUserId: actor.id,
      action: 'seat.create',
      entityType: 'Seat',
      entityId: seat.id,
      after: { label: seat.label },
    });
    return seat;
  });
}

export async function createPerson(actor: StaffActor, input: { fullName: string; email?: string; phone?: string }) {
  return withTenant(scopeFor(actor), async (tx) => {
    const governmentId = actor.memberships[0]?.governmentId;
    if (!governmentId) throw new DomainError(403, 'Forbidden');
    assertCan(actor, 'government.configure', { governmentId });
    const person = await tx.person.create({ data: input });
    await writeAudit(tx, {
      governmentId,
      actorUserId: actor.id,
      action: 'person.create',
      entityType: 'Person',
      entityId: person.id,
      after: { fullName: person.fullName },
    });
    return person;
  });
}

export async function createTerm(
  actor: StaffActor,
  input: { seatId: string; personId: string; startsOn: string; endsOn?: string | null; isChair?: boolean },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const seat = await tx.seat.findUnique({ where: { id: input.seatId }, include: { body: true } });
    if (!seat) throw new DomainError(404, 'Seat not found');
    assertCan(actor, 'government.configure', { governmentId: seat.body.governmentId });
    const term = await tx.term.create({
      data: {
        seatId: input.seatId,
        personId: input.personId,
        startsOn: new Date(input.startsOn),
        endsOn: input.endsOn ? new Date(input.endsOn) : null,
        isChair: input.isChair ?? false,
      },
    });
    await writeAudit(tx, {
      governmentId: seat.body.governmentId,
      actorUserId: actor.id,
      action: 'term.create',
      entityType: 'Term',
      entityId: term.id,
    });
    return term;
  });
}

export async function applyForSeat(input: { seatId: string; name: string; email: string; statement: string; residentId?: string }) {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const seat = await tx.seat.findUnique({ where: { id: input.seatId }, include: { body: true } });
    if (!seat) throw new DomainError(404, 'Seat not found');
    const application = await tx.boardApplication.create({
      data: {
        seatId: input.seatId,
        name: input.name,
        email: input.email,
        statement: input.statement,
        residentId: input.residentId,
      },
    });
    await writeAudit(tx, {
      governmentId: seat.body.governmentId,
      actorResidentId: input.residentId,
      action: 'application.create',
      entityType: 'BoardApplication',
      entityId: application.id,
    });
    return application;
  });
}
