import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseModule } from './course-module.entity';

@Injectable()
export class ModulesService {
  constructor(@InjectRepository(CourseModule) private repo: Repository<CourseModule>) {}

  findByCourse(courseId: string) {
    return this.repo.find({ where: { courseId }, order: { order: 'ASC' } });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  create(courseId: string, data: Partial<CourseModule>) {
    return this.repo.save(this.repo.create({ ...data, courseId }));
  }

  async update(id: string, data: Partial<CourseModule>) {
    const module = await this.findOne(id);
    if (!module) throw new NotFoundException('Module not found');
    return this.repo.save({ ...module, ...data });
  }

  async remove(id: string) {
    const module = await this.findOne(id);
    if (!module) throw new NotFoundException('Module not found');
    return this.repo.remove(module);
  }
}
