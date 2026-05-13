import Joi from 'joi';

export const createCategorySchema = Joi.object({
    name: Joi.string().min(1).max(50).required(),
    icon: Joi.string().min(1).max(10).required(),
    color: Joi.string()
        .pattern(/^#[0-9A-Fa-f]{6}$/)
        .required()
        .messages({ 'string.pattern.base': 'color must be a valid hex color (e.g. #f97316)' }),
    isDefault: Joi.boolean().optional(),
});
