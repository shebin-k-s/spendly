import Joi from 'joi';

export const merchantRuleSchema = Joi.object({
    name: Joi.string().trim().min(1).max(60).required(),
    aliases: Joi.array().items(Joi.string().trim().allow('').max(60).pattern(/^[^,]+$/).messages({ 'string.pattern.base': 'other names cannot contain commas' })).max(10).default([]),
    categoryId: Joi.string().uuid().required(),
});
