import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, Subject, filter, from, map, switchMap } from 'rxjs';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { ToggleChecklistTaskDto } from './dto/toggle-checklist-task.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import {
  Checklist,
  ChecklistDocument,
  ChecklistStatus,
  ChecklistTask,
} from './schemas/checklist.schema';

export interface ChecklistResponse {
  _id: string;
  locationId: string;
  date: string;
  title: string;
  templateKey?: string;
  area: string;
  roles: Role[];
  status: ChecklistStatus;
  note?: string;
  tasks: Array<{
    _id: string;
    title: string;
    note?: string;
    isDone: boolean;
    doneBy?: string;
    doneAt?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistEvent {
  type: 'created' | 'updated' | 'task-updated' | 'deleted';
  checklist: ChecklistResponse;
}

@Injectable()
export class ChecklistsService {
  private readonly checklistEvents$ = new Subject<ChecklistEvent>();
  private readonly defaultChecklistTemplates = [
    {
      templateKey: 'front-of-house',
      title: 'Checkliste für den Gastraum (Front of House)',
      area: 'Gastraum',
      roles: [Role.Service, Role.Filialleiter],
      tasks: [
        {
          title:
            'Reinigung: Tische, Stühle und Böden reinigen; Fenster überprüfen; Mülleimer leeren.',
        },
        {
          title:
            'Eindecken: Tische einladend decken, frische Blumen/Deko platzieren, Speisekarten reinigen.',
        },
        {
          title: 'Ambiente: Beleuchtung, Musik und Raumtemperatur anpassen.',
        },
        {
          title:
            'Ausstattung: Servietten, Besteck, Gläser, Salz- & Pfefferstreuer auffüllen.',
        },
      ],
    },
    {
      templateKey: 'back-of-house',
      title: 'Checkliste für die Küche (Back of House)',
      area: 'Küche',
      roles: [Role.Kueche, Role.Filialleiter],
      tasks: [
        {
          title:
            'HACCP & Hygiene: Kühl- und Gefrierraumtemperaturen prüfen und dokumentieren (Eigenkontrolle).',
        },
        {
          title:
            'Mise-en-place: Alle Lebensmittel für den Tagesbedarf vorbereiten, beschriften und prüfen.',
        },
        {
          title:
            'Geräte-Check: Öfen, Fritteusen, Herde und Kaffeemaschine auf Funktion prüfen.',
        },
        {
          title: 'Reinigung: Arbeitsflächen und Arbeitsgeräte desinfizieren.',
        },
      ],
    },
    {
      templateKey: 'bar',
      title: 'Checkliste für die Bar / Schankanlage',
      area: 'Bar',
      roles: [Role.Service, Role.Filialleiter],
      tasks: [
        {
          title:
            'Schanktechnik: Anlage auf Funktion und Sauberkeit prüfen; Reinigungsmittel bereitstellen.',
        },
        {
          title: 'Bestand: Getränke auffüllen (Kühlung).',
        },
        {
          title: 'Gläser: Ausreichend saubere Gläser bereitstellen.',
        },
      ],
    },
  ];

  constructor(
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<ChecklistDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(payload: CreateChecklistDto, actor: AuthenticatedUser): Promise<ChecklistResponse> {
    await this.assertCanUseLocation(actor, payload.locationId);
    const checklist = await this.checklistModel.create({
      ...payload,
      date: this.toDay(payload.date),
      roles: payload.roles ?? [],
      status: ChecklistStatus.Open,
      tasks: payload.tasks.map((task) => ({ ...task, isDone: false })),
    });
    const response = this.toResponse(checklist);
    this.checklistEvents$.next({ type: 'created', checklist: response });
    return response;
  }

  async findAll(actor: AuthenticatedUser, locationId?: string, date?: string): Promise<ChecklistResponse[]> {
    const locationIds = locationId ? [locationId] : await this.getReadableLocationIds(actor);
    await Promise.all(locationIds.map((id) => this.assertCanUseLocation(actor, id)));
    const day = date ? this.toDay(date) : undefined;
    if (day) await this.ensureDefaultChecklists(locationIds, day);
    const filter: Record<string, unknown> = { locationId: { $in: locationIds } };
    if (day) filter.date = day;
    const checklists = await this.checklistModel
      .find(filter)
      .sort({ date: -1, area: 1, title: 1 })
      .exec();
    return checklists
      .filter((checklist) => this.canSeeChecklist(actor, checklist.roles))
      .map((checklist) => this.toResponse(checklist));
  }

  async update(id: string, payload: UpdateChecklistDto, actor: AuthenticatedUser): Promise<ChecklistResponse> {
    const checklist = await this.checklistModel.findById(id).exec();
    if (!checklist) throw new NotFoundException('Checkliste nicht gefunden');
    await this.assertCanUseLocation(actor, checklist.locationId);
    const update = {
      ...payload,
      ...(payload.date ? { date: this.toDay(payload.date) } : {}),
      ...(payload.tasks ? { tasks: this.mergeTasks(checklist.tasks, payload.tasks) } : {}),
    };
    checklist.set(update);
    this.updateStatus(checklist);
    const saved = await checklist.save();
    const response = this.toResponse(saved);
    this.checklistEvents$.next({ type: 'updated', checklist: response });
    return response;
  }

  async toggleTask(
    checklistId: string,
    taskId: string,
    payload: ToggleChecklistTaskDto,
    actor: AuthenticatedUser,
  ): Promise<ChecklistResponse> {
    const checklist = await this.checklistModel.findById(checklistId).exec();
    if (!checklist) throw new NotFoundException('Checkliste nicht gefunden');
    await this.assertCanUseLocation(actor, checklist.locationId);
    const task = checklist.tasks.find((item) => item._id?.toString() === taskId);
    if (!task) throw new NotFoundException('Aufgabe nicht gefunden');
    task.isDone = payload.isDone;
    task.doneBy = payload.isDone ? actor.sub : undefined;
    task.doneAt = payload.isDone ? new Date() : undefined;
    if (payload.note !== undefined) task.note = payload.note;
    this.updateStatus(checklist);
    const saved = await checklist.save();
    const response = this.toResponse(saved);
    this.checklistEvents$.next({ type: 'task-updated', checklist: response });
    return response;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<ChecklistResponse> {
    const checklist = await this.checklistModel.findById(id).exec();
    if (!checklist) throw new NotFoundException('Checkliste nicht gefunden');
    await this.assertCanUseLocation(actor, checklist.locationId);
    if (checklist.templateKey) {
      throw new BadRequestException('Standard-Checklisten können nicht gelöscht werden');
    }
    await this.checklistModel.deleteOne({ _id: id }).exec();
    const response = this.toResponse(checklist);
    this.checklistEvents$.next({ type: 'deleted', checklist: response });
    return response;
  }

  stream(actor: AuthenticatedUser, locationId?: string, date?: string): Observable<MessageEvent> {
    const day = date ? this.toDay(date).getTime() : undefined;

    return from(this.getReadableLocationIds(actor)).pipe(
      switchMap((locationIds) =>
        this.checklistEvents$.pipe(
          filter((event) => locationIds.includes(event.checklist.locationId)),
          filter((event) => !locationId || event.checklist.locationId === locationId),
          filter((event) => !day || this.toDay(event.checklist.date).getTime() === day),
          filter((event) => this.canSeeChecklist(actor, event.checklist.roles)),
          map((event) => ({ data: event }) as MessageEvent),
        ),
      ),
    );
  }

  private updateStatus(checklist: ChecklistDocument): void {
    const done = checklist.tasks.filter((task) => task.isDone).length;
    checklist.status =
      done === 0
        ? ChecklistStatus.Open
        : done === checklist.tasks.length
          ? ChecklistStatus.Done
          : ChecklistStatus.InProgress;
  }

  private async ensureDefaultChecklists(locationIds: string[], date: Date): Promise<void> {
    await Promise.all(
      locationIds.flatMap((locationId) =>
        this.defaultChecklistTemplates.map((template) =>
          this.ensureDefaultChecklist(locationId, date, template),
        ),
      ),
    );
  }

  private async ensureDefaultChecklist(
    locationId: string,
    date: Date,
    template: (typeof this.defaultChecklistTemplates)[number],
  ): Promise<void> {
    const checklist = await this.checklistModel
      .findOne({ locationId, date, templateKey: template.templateKey })
      .exec();

    if (!checklist) {
      await this.checklistModel.create({
        locationId,
        date,
        templateKey: template.templateKey,
        title: template.title,
        area: template.area,
        roles: template.roles,
        status: ChecklistStatus.Open,
        tasks: template.tasks.map((task) => ({ ...task, isDone: false })),
      });
      return;
    }

    const existingTitles = new Set(
      checklist.tasks.map((task) => this.normalizeTaskTitle(task.title)),
    );
    const missingTasks = template.tasks.filter(
      (task) => !existingTitles.has(this.normalizeTaskTitle(task.title)),
    );

    if (!missingTasks.length) return;

    checklist.tasks.push(
      ...missingTasks.map((task) => ({ ...task, isDone: false }) as ChecklistTask),
    );
    this.updateStatus(checklist);
    await checklist.save();
  }

  private mergeTasks(
    existingTasks: ChecklistTask[],
    incomingTasks: CreateChecklistDto['tasks'],
  ): ChecklistTask[] {
    const existingByTitle = new Map(
      existingTasks.map((task) => [this.normalizeTaskTitle(task.title), task]),
    );

    return incomingTasks.map((task) => {
      const existing = existingByTitle.get(this.normalizeTaskTitle(task.title));
      if (!existing) return { ...task, isDone: false } as ChecklistTask;

      return {
        _id: existing._id,
        title: task.title,
        note: task.note ?? existing.note,
        isDone: existing.isDone,
        doneBy: existing.doneBy,
        doneAt: existing.doneAt,
      } as ChecklistTask;
    });
  }

  private normalizeTaskTitle(title: string): string {
    return title.trim().toLowerCase();
  }

  private canSeeChecklist(actor: AuthenticatedUser, roles: Role[]): boolean {
    if (actor.roles.includes(Role.Admin)) return true;
    return roles.length === 0 || roles.some((role) => actor.roles.includes(role));
  }

  private async assertCanUseLocation(actor: AuthenticatedUser, locationId: string): Promise<void> {
    if (actor.roles.includes(Role.Admin)) return;
    const locationIds = await this.getReadableLocationIds(actor);
    if (!locationIds.includes(locationId)) throw new ForbiddenException('Kein Zugriff auf diese Filiale');
  }

  private async getReadableLocationIds(actor: AuthenticatedUser): Promise<string[]> {
    if (actor.roles.includes(Role.Admin)) {
      const locations = await this.locationModel.find().select('_id').exec();
      return locations.map((location) => location._id.toString());
    }
    const user = await this.userModel.findById(actor.sub).select('locationId locationIds').exec();
    const ownLocationIds = user
      ? [...new Set([...(user.locationIds ?? []), ...(user.locationId ? [user.locationId] : [])])].map((id) => id.toString())
      : [];
    const managedLocationIds = actor.roles.includes(Role.Filialleiter)
      ? await this.getManagedLocationIds(actor.sub)
      : [];
    return [...new Set([...ownLocationIds, ...managedLocationIds])];
  }

  private async getManagedLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel.find({ managerId }).select('_id').exec();
    return locations.map((location) => location._id.toString());
  }

  private toDay(value: string): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private toResponse(checklist: ChecklistDocument): ChecklistResponse {
    const timestamped = checklist as ChecklistDocument & { createdAt?: Date; updatedAt?: Date };
    return {
      _id: checklist._id.toString(),
      locationId: checklist.locationId,
      date: checklist.date.toISOString(),
      title: checklist.title,
      templateKey: checklist.templateKey,
      area: checklist.area,
      roles: checklist.roles,
      status: checklist.status,
      note: checklist.note,
      tasks: checklist.tasks.map((task) => ({
        _id: task._id?.toString() ?? '',
        title: task.title,
        note: task.note,
        isDone: task.isDone,
        doneBy: task.doneBy,
        doneAt: task.doneAt?.toISOString(),
      })),
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }
}
