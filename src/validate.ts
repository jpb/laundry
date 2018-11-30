import * as _ from 'lodash';

import {Visitor} from './ast';
import {Path, Error, ResourceSpecificationError} from './types';
import {
  PropertyTypes,
  PropertyValueType,
  PrimitiveType,
  Type
} from './spec';
import * as yaml from './yaml';
import {forEachWithPath} from './util';

export function cfnFn(tag: yaml.CfnFn<any>, spec: PropertyValueType): boolean {
  let returnSpec;
  if(_.isFunction(tag.returnSpec)) {
    returnSpec = tag.returnSpec();
  } else {
    returnSpec = tag.returnSpec;
  }
  return _.isEqual(spec, returnSpec);
}

export function optional(o: any): boolean {
  // Used to short-circuit validation checks
  return !_.isUndefined(o);
}

export function required(path: Path, o: any, errors: Error[]): boolean {
   if(_.isNil(o)) {
    errors.push({path, message: 'is required'});
    return false;
  } else {
    return true;
  }
}

export function object(path: Path, o: any, errors: Error[]): boolean {
  if(!_.isPlainObject(o)) {
    errors.push({path, message: 'must be an Object'});
    return false;
  } else {
    return true;
  }
}

export function list(path: Path, o: any, errors: Error[]): boolean {
   if(!_.isArray(o)) {
    errors.push({path, message: 'must be a List'});
    return false;
  } else {
    return true;
  }
}

export function string(path: Path, o: any, errors: Error[]): boolean {
  if(o instanceof yaml.CfnFn && cfnFn(o, { PrimitiveType: 'String' })) {
    return true;
  } else if (_.isString(o)) {
    return true;
  } else if (_.isNumber(o)) { // YAML interprets number only
    return true;
  } else {
    errors.push({path, message: `must be a String, got ${JSON.stringify(o)}`});
    return false;
  }
}

export function number(path: Path, o: any, errors: Error[]): boolean {
  if(_.isNumber(o)) {
    return true;
  } else if(_.isString(o) && _.isFinite(_.parseInt(o))) {
    return true;
  } else {
    errors.push({path, message: 'must be a Number'});
    return false;
  }
}

export function boolean(path: Path, o: any, errors: Error[]): boolean {
  if(o instanceof yaml.CfnFn && cfnFn(o, { PrimitiveType: 'Boolean' })) {
    return true;
  } else if(_.isBoolean(o)) {
    return true;
  } else if(_.isString(o) && o.match(/^(true|false)$/i)) {
    return true;
  } else {
    errors.push({path, message: 'must be a Boolean'});
    return false;
  }
}

export function error(path: Path, message: string, errors: Error[]): void {
  errors.push({path, message});
}

export class Validator extends Visitor {
  protected errors: Error[];

  constructor(errors: Error[]) {
    super();
    this.errors = errors;
  }

  public error(path: Path, message: string) {
    this.errors.push({ path, message, source: this.constructor.name });
  }

  protected forEachWithPath<T>(
    path: Path,
    as: Array<T>,
    fn: (path: Path, a: T, i: number|string) => void)
  : void {
    _.forEach(as, (a, i) => {
      fn(path.concat(i.toString()), a, i);
    });
  }

}

function primitiveType(path: Path, primitiveType: PrimitiveType, property: any, errors: Error[]) {
  let validator: (path: Path, o: any, errors: Error[]) => boolean;
  switch(primitiveType) {
    case 'Boolean':
      validator = boolean;
      break;
    case 'Double':
      validator = number;
      break;
    case 'Integer':
      validator = number;
      break;
    case 'Json':
      validator = object;
      break;
    case 'Long':
      validator = number;
      break;
    case 'String':
      validator = string;
      break;
    case 'Timestamp':
      validator = string; // TODO better check
    default:
      throw new ResourceSpecificationError(`Unknown PrimitiveType '${primitiveType}'`, path);
  }
  validator.call(undefined, path, property, errors);
}

function complexType(path: Path, resourceType: string, type: Type, properties: any, errors: Error[]) {
  // TODO check that resourceType is valid
  const propertyType = _.get(PropertyTypes, `${resourceType}.${type}`) || _.get(PropertyTypes, type);
   if(propertyType) {
     if(object(path, properties, errors)) {
       forEachWithPath(path, properties, (path, property, name) => {
         const s = _.get(propertyType.Properties, name);
         if(s) {
           if(s.PrimitiveType) {
             primitiveType(path, s.PrimitiveType, property, errors);
           } else if(s.Type === 'Map') {
             object(path, property, errors);
           } else if(s.Type === 'List') {
             if(_.isArray(property)) {
               forEachWithPath(path, property, (path, v, k) => {
                 if(s.PrimitiveItemType) {
                   primitiveType(path, s.PrimitiveItemType, v, errors);
                 } else if(s.ItemType) {
                   complexType(path, resourceType, s.ItemType, v, errors);
                 } else {
                   throw new ResourceSpecificationError(`Unknown List Type '${s.PrimitiveItemType}'`, path)
                 }
               });
             } else {
               errors.push({path, message: 'must be a List'});
             }
           }
         } else {
           errors.push({path, message: 'invalid property'});
         }
       });
    }
  } else {
    throw new ResourceSpecificationError(`Unknown Type '${propertyType}'`, path);
  }
}

export function spec(path: Path, resourceType: string, propertyType: PropertyValueType, property: any, errors: Error[]) {
  if(propertyType.PrimitiveType) {
    primitiveType(path, propertyType.PrimitiveType, property, errors);
  } else if(propertyType.Type === 'Map') {
    object(path, property, errors);
  } else if(propertyType.Type === 'List') {
    if(_.isArray(property)) {
      forEachWithPath(path, property, (path, v, i) => {
        if(propertyType.PrimitiveItemType) {
          primitiveType(path, propertyType.PrimitiveItemType, v, errors);
        } else if(propertyType.ItemType) {
          complexType(path, resourceType, propertyType.ItemType, v, errors);
        } else {
          throw new ResourceSpecificationError('No property type', path);
        }
      });
    } else {
      errors.push({ path, message: 'must be a List'});
    }
  } else if(propertyType.Type) {
    complexType(path, resourceType, propertyType.Type, property, errors);
  } else {
    throw new ResourceSpecificationError('No property type', path);
  }
}
