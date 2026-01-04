const express = require('express');
const router = express.Router();
const database = require('../config/database').getDB();
const { authenticate, checkRecipeOwnership } = require('../middleware/auth');

const sql = {
    getById: `
        SELECT r.*, c.name as cuisine_name, g.name as goal_name,
               d.name as diet_name, a.name as allergy_name
        FROM Recipes r
        LEFT JOIN Cuisines c ON r.cuisine_id = c.cuisine_id
        LEFT JOIN Goals g ON r.goal_id = g.goal_id
        LEFT JOIN DietaryInformation d ON r.DietaryInformation_id = d.diet_id
        LEFT JOIN AllergiesInformation a ON r.AllergiesInformation_id = a.allergy_id
        WHERE r.recipe_id = ?
    `,
    getIngredients: `
        SELECT i.ingredient_id, i.name, i.unit, ri.quantity
        FROM RecipeIngredients ri
        JOIN Ingredients i ON ri.ingredient_id = i.ingredient_id
        WHERE ri.recipe_id = ?
    `,
    getInstructions: `
        SELECT instruction_id, step_number, description
        FROM RecipeInstructions
        WHERE recipe_id = ?
        ORDER BY step_number
    `,
    create: `
        INSERT INTO Recipes (title, description, image_url, cuisine_id, goal_id, DietaryInformation_id, AllergiesInformation_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
};

// GET /api/recipes/:id (Détails complets)
router.get('/:id', (req, res) => {
    const recipeId = req.params.id;
    database.get(sql.getById, [recipeId], (err, recipe) => {
        if (err || !recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });

        database.all(sql.getIngredients, [recipeId], (err, ingredients) => {
            database.all(sql.getInstructions, [recipeId], (err, instructions) => {
                recipe.ingredients = ingredients || [];
                recipe.instructions = instructions || [];
                res.status(200).json({ success: true, data: recipe });
            });
        });
    });
});

// POST /api/recipes (Création avec Ingrédients et Instructions)
router.post('/', authenticate, (req, res) => {
    const { title, description, image_url, cuisine_id, goal_id, DietaryInformation_id, AllergiesInformation_id, ingredients, instructions } = req.body;
    const userId = req.user.user_id;

    database.run(
        sql.create,
        [title, description, image_url, cuisine_id, goal_id, DietaryInformation_id, AllergiesInformation_id, userId],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            const newRecipeId = this.lastID;

            // Insertion des Ingrédients
            if (ingredients) {
                ingredients.forEach((ing) => {
                    database.get("SELECT ingredient_id FROM Ingredients WHERE name = ?", [ing.name], (err, row) => {
                        if (row) {
                            database.run("INSERT INTO RecipeIngredients (recipe_id, ingredient_id, quantity) VALUES (?, ?, ?)", [newRecipeId, row.ingredient_id, ing.quantity]);
                        } else {
                            database.run("INSERT INTO Ingredients (name, unit) VALUES (?, ?)", [ing.name, ing.unit], function() {
                                database.run("INSERT INTO RecipeIngredients (recipe_id, ingredient_id, quantity) VALUES (?, ?, ?)", [newRecipeId, this.lastID, ing.quantity]);
                            });
                        }
                    });
                });
            }

            // Insertion des Instructions
            if (instructions) {
                instructions.forEach((step) => {
                    database.run(
                        "INSERT INTO RecipeInstructions (recipe_id, step_number, description) VALUES (?, ?, ?)",
                        [newRecipeId, step.step_number, step.description]
                    );
                });
            }

            res.status(201).json({ success: true, message: 'Recette créée !', recipe_id: newRecipeId });
        }
    );
});

module.exports = router;