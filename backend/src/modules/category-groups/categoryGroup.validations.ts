import Joi from 'joi';

export const categoryGroupSchema = Joi.object({
    name: Joi.string().trim().min(1).max(40).required(),
});
