import * as _ from 'lodash';

import * as validate from '../validate';
import { Validator } from '../validate';
import { Path, Error } from '../types';
import {
  PrimitiveType,
  Type,
  ResourceType,
  PropertyType,
  ResourceTypes,
  PropertyTypes,
  AtLeastOne,
  Exclusive,
  Inclusive,
} from '../spec';

export class ResourceTypeValidator extends Validator {
  Resource(path: Path, resource: any) {
    if (_.isObject(resource)) {
      const resourceType = _.get(resource, 'Type');
      if (validate.required(path, resourceType, this.errors)) {
        // TODO Support AWS::Serverless::*
        if (!(_.startsWith(resourceType, 'Custom::')
          || _.startsWith(resourceType, 'AWS::Serverless'))) {
          const s: ResourceType = _.get(ResourceTypes, resourceType);
          if (!s) {
            this.errors.push({
              path: path.concat('Type'),
              message: `invalid type ${resource.Type}`
            });
          }
        }
      }
    }
  }
}

export class RequriedResourcePropertyValidator extends Validator {
  Resource(path: Path, resource: any) {
    if (_.isObject(resource)) {
      const s: ResourceType = _.get(ResourceTypes, resource.Type);
      if (s) {
        _.forEach(s.Properties, (property, name) => {
          if (property.Required) {
            validate.required(path.concat(['Properties', name]), _.get(resource, ['Properties', name]), this.errors);
          }
        });
      }
    }
  }
}

export class ResourcePropertyValidator extends Validator {
  Resource(path: Path, resource: any) {
    if (_.isObject(resource)) {
      const resourceType: ResourceType = _.get(ResourceTypes, resource.Type);
      if (resourceType) {
        if (_.isObject(resource.Properties)) {
          this.forEachWithPath(path.concat('Properties'), resource.Properties, (path, property, name) => {
            const propertyType = resourceType.Properties[name];
            if (propertyType) {
              validate.spec(path, resource.Type, propertyType, property, this.errors);
            } else {
              this.errors.push({ path, message: 'invalid property' });
            }
          });
        }
      }
    }
  }
}

export class ResourceExclusivePropertyValidator extends Validator {

  Resources(path: Path, resources: any) {
    if (_.isObject(resources)) {
      this.forEachWithPath(path, resources, (path, resource) => {
        const resourceType = _.get(resource, 'Type');
        const resourceProperties = _.get(resource, 'Properties');

        if (_.isObject(resourceProperties)) {
          const resourceSpec = _.get(Exclusive.ResourceTypes, resourceType);
          if (resourceSpec) {
            _.forEach(resourceSpec, (forbiddenProperties, propertyName) => {
              if (_.has(resourceProperties, propertyName)) {
                _.forEach(forbiddenProperties, (forbiddenProperty) => {
                  if (_.has(resourceProperties, forbiddenProperty)) {
                    this.errors.push({
                      path: path.concat(['Properties', forbiddenProperty]),
                      message: `${forbiddenProperty} can not be set when ${propertyName} is set`
                    });
                  }
                });
              }
            });
          }

          _.forEach(resourceProperties, (propertyValue, propertyName) => {
            const propertySpec = Exclusive.PropertyTypes[`${resourceType}.${propertyName}`];
            if (propertySpec) {
              _.forEach(propertySpec, (forbiddenProperties) => {
                if (_.isArray(propertyValue)) {
                  _.forEach(propertyValue, (value) => {
                    if (_.isObject(value)) {
                      this.validateResourceProperty(path, propertyName, value, forbiddenProperties)
                    }
                  });
                } else if (_.isObject(propertyValue)) {
                  this.validateResourceProperty(path, propertyName, propertyValue, forbiddenProperties)
                }
              });
            }
          });
        }
      });
    }
  }

  validateResourceProperty(path: Path, name: string, value: object, forbiddenProperties: string[]) {
    _.forEach(forbiddenProperties, (forbiddenProperty) => {
      if (_.has(value, forbiddenProperty)) {
        this.errors.push({
          path: path.concat(['Properties', forbiddenProperty]),
          message: `${forbiddenProperty} can not be set when ${name} is set`
        });
      }
    })
  }
}

export class ResourceAtLeastOnePropertyValidator extends Validator {

  Resources(path: Path, resources: any) {
    if (_.isObject(resources)) {
      this.forEachWithPath(path, resources, (path, resource) => {
        const resourceType = _.get(resource, 'Type');
        const spec = _.get(AtLeastOne.ResourceTypes, resourceType);
        if (spec) {
          _.forEach(spec, (properties) => {
            // If none of the properties are set, thats an error
            if (!_.some(properties, (property) => _.has(resource, ['Properties', property]))) {
              this.errors.push({ path, message: `one of ${properties.join(', ')} must be provided` });
            }
          });
        }
      });
    }
  }

}

export class ResourceInclusivePropertyValidator extends Validator {

  Resources(path: Path, resources: any) {
    if (_.isObject(resources)) {
      this.forEachWithPath(path, resources, (path, resource) => {
        const resourceProperties = _.get(resource, 'Properties');
        if (_.isObject(resourceProperties)) {
          const resourceType = _.get(resource, 'Type');
          const spec = _.get(Inclusive.ResourceTypes, resourceType);
          _.forEach(resourceProperties, (valuve, name) => {
            const properties = _.get(spec, name);
            if (properties) {
              if (!_.some(properties, (property) => _.has(resourceProperties, property))) {
                this.errors.push({ path, message: `${properties.join(', ')} must be provided when ${name} is provided` });
              }
            }
          });
        }
      });
    }
  }

}

export class ResourceConditionValidator extends Validator {

  conditions: string[] = [];

  Conditions(path: Path, conditions: any) {
    if (_.isObject(conditions)) {
      _.forEach(conditions, (condition, name) => {
        this.conditions.push(name);
      });
    }
  }

  Resource(path: Path, resource: any) {
    if (_.isObject(resource)) {
      const condition = _.get(resource, 'Condition');
      path = path.concat('Condition');
      if (validate.optional(path, condition, this.errors)
        && validate.string(path, condition, this.errors)) {
        if (!_.includes(this.conditions, condition)) {
          this.errors.push({
            path,
            message: `${condition} is not a valid Condition`
          });
        }
      }
    }
  }
}
