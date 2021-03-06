import * as _ from 'lodash';

import * as validate from '../validate';
import { Validator } from '../validate';
import { Path } from '../types';
import {
  ResourceType,
  ResourceTypes,
  AtLeastOne,
  OnlyOne,
  Exclusive,
  Inclusive,
} from '../spec';
import {
  withSuggestion
} from '../util';

export class ResourceTypeValidator extends Validator {
  Resource(path: Path, resource: any) {
    if (_.isObject(resource)) {
      const resourceType = _.get(resource, 'Type');
      if (validate.required(path, resourceType, this.addError)) {
        // TODO Support AWS::Serverless::*
        if (!(_.startsWith(resourceType, 'Custom::')
          || _.startsWith(resourceType, 'AWS::Serverless'))) {
          const s: ResourceType = _.get(ResourceTypes, resourceType);
          if (!s) {
            const message = withSuggestion(`invalid type ${resource.Type}`, _.keys(ResourceTypes), resourceType);
            this.addError(path.concat('Type'), message);
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
            validate.required(
              path.concat(['Properties', name]),
              _.get(resource, ['Properties', name]),
              this.addError
            );
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
              validate.spec(path, name.toString(), resource.Type, propertyType, property, this.addError);
            } else {
              const message = withSuggestion('invalid property', _.keys(resourceType.Properties), name as string);
              this.addError(path, message);
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
                    this.addError(
                      path.concat(['Properties', forbiddenProperty]),
                      `${forbiddenProperty} can not be set when ${propertyName} is set`
                    );
                  }
                });
              }
            });
          }
        }
      });
    }
  }
}

export class ResourceAtLeastOnePropertyValidator extends Validator {

  Resources(path: Path, resources: any) {
    if (_.isObject(resources)) {
      this.forEachWithPath(path, resources, (path, resource) => {
        const resourceType = _.get(resource, 'Type');
        const spec = _.get(AtLeastOne.ResourceTypes, resourceType);
        if (spec) {
          _.forEach(spec, (propertyNames) => {
            const present = _.filter(propertyNames, (propertyName) => {
              return _.has(resource, ['Properties', propertyName]);
            });
            if (present.length === 0) {
              this.addError(
                path.concat('Properties'),
                `one of ${propertyNames.join(', ')} must be provided`
              );
            }
          });
        }
      });
    }
  }

}

export class ResourceOnlyOnePropertyValidator extends Validator {

  Resources(path: Path, resources: any) {
    if (_.isObject(resources)) {
      this.forEachWithPath(path, resources, (path, resource) => {
        const resourceType = _.get(resource, 'Type');
        const spec = _.get(OnlyOne.ResourceTypes, resourceType);
        if (spec) {
          _.forEach(spec, (propertyNames) => {
            // If more than one is set, thats an error
            const present = _.filter(propertyNames, (property) => _.has(resource, ['Properties', property]));
            if (present.length > 1) {
              this.addError(
                path.concat('Properties'),
                `only one of ${propertyNames.join(', ')} may be provided`
              );
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
          _.forEach(resourceProperties, (value, name) => {
            const properties = _.get(spec, name);
            if (properties) {
              if (!_.some(properties, (property) => _.has(resourceProperties, property))) {
                this.addError(
                  path.concat(['Properties', name]),
                  `${properties.join(', ')} must be provided when ${name} is provided`
                );
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
      if (validate.optional(path, condition, this.addError)
        && validate.string(path, condition, this.addError)) {
        if (!_.includes(this.conditions, condition)) {
          this.addError(
            path,
            withSuggestion(
              `${condition} is not a valid Condition`,
              this.conditions,
              condition
            )
          );
        }
      }
    }
  }
}
