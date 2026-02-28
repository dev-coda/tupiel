import { Router } from 'express';
import {
  getAllDiasNoLaborales,
  getDiaNoLaboralById,
  createDiaNoLaboral,
  updateDiaNoLaboral,
  deleteDiaNoLaboral,
  addAllSundaysOfYear,
} from '../services/dias-no-laborales';

const router = Router();

/**
 * GET /api/dias-no-laborales
 * Get all non-working days
 */
router.get('/', async (_req, res) => {
  try {
    const dias = await getAllDiasNoLaborales();
    res.json({ success: true, data: dias });
  } catch (error) {
    console.error('Error fetching dias no laborales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch non-working days',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/dias-no-laborales/:id
 * Get a specific non-working day by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
      });
    }
    
    const dia = await getDiaNoLaboralById(id);
    if (!dia) {
      return res.status(404).json({
        success: false,
        error: 'Non-working day not found',
      });
    }
    
    res.json({ success: true, data: dia });
  } catch (error) {
    console.error('Error fetching dia no laboral:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch non-working day',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/dias-no-laborales
 * Create a new non-working day
 */
router.post('/', async (req, res) => {
  try {
    const { fecha, descripcion } = req.body;
    
    if (!fecha) {
      return res.status(400).json({
        success: false,
        error: 'Fecha is required',
      });
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }
    
    const dia = await createDiaNoLaboral(fecha, descripcion);
    res.status(201).json({ success: true, data: dia });
  } catch (error) {
    console.error('Error creating dia no laboral:', error);
    
    // Check for duplicate key error
    if (error instanceof Error && error.message.includes('Duplicate')) {
      return res.status(409).json({
        success: false,
        error: 'This date already exists',
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create non-working day',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/dias-no-laborales/:id
 * Update a non-working day
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
      });
    }
    
    const { fecha, descripcion } = req.body;
    
    if (!fecha) {
      return res.status(400).json({
        success: false,
        error: 'Fecha is required',
      });
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
    }
    
    const dia = await updateDiaNoLaboral(id, fecha, descripcion);
    res.json({ success: true, data: dia });
  } catch (error) {
    console.error('Error updating dia no laboral:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Non-working day not found',
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update non-working day',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/dias-no-laborales/:id
 * Delete a non-working day
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
      });
    }
    
    await deleteDiaNoLaboral(id);
    res.json({ success: true, message: 'Non-working day deleted successfully' });
  } catch (error) {
    console.error('Error deleting dia no laboral:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete non-working day',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/dias-no-laborales/add-sundays
 * Add all Sundays of the current year (or specified year)
 */
router.post('/add-sundays', async (req, res) => {
  try {
    const { year } = req.body;
    const targetYear = year ? parseInt(year, 10) : undefined;
    
    if (targetYear && (isNaN(targetYear) || targetYear < 1900 || targetYear > 2100)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year. Must be between 1900 and 2100',
      });
    }
    
    const inserted = await addAllSundaysOfYear(targetYear);
    res.json({
      success: true,
      message: `Added ${inserted} Sundays to non-working days`,
      inserted,
    });
  } catch (error) {
    console.error('Error adding Sundays:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add Sundays',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
